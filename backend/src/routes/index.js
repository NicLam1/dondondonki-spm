const { Router } = require('express');
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const { ActivityTypes } = require('../models/activityLog');
const { notifyTaskAssigned, notifyTaskUnassigned, notifyTaskStatusChange } = require('../services/emailNotifications');
const { recordTaskActivity, recordMultipleTaskActivities } = require('../services/activityLog');
const { checkAndSendReminders } = require('../services/reminderService');
const { checkAndSendOverdue } = require('../services/overdueService');

const router = Router();
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    console.log('File received:', file.originalname, 'MIME type:', file.mimetype); // Debug log
    
    // Accept common file types (more comprehensive list)
    const allowedTypes = [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      console.log('File type accepted:', file.mimetype);
      cb(null, true);
    } else {
      console.log('File type rejected:', file.mimetype);
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  }
});

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);


// Normalize any legacy statuses to the canonical set
function mapLegacyStatus(status) {
  if (status === 'TO_DO' || status === 'IN_PROGRESS') return 'ONGOING';
  if (status === 'DONE' ) return 'COMPLETED';
  return status;
}


// Calculate next due date based on recurrence type and interval
function calculateNextDueDate(currentDueDate, recurrenceType, recurrenceInterval = 1) {
  console.log('📅 Calculating next due date:', { currentDueDate, recurrenceType, recurrenceInterval });
  
  const current = new Date(currentDueDate);
  
  // Validate input date
  if (isNaN(current.getTime())) {
    console.error('❌ Invalid current due date:', currentDueDate);
    return null;
  }
  
  const next = new Date(current);
  
  switch (recurrenceType) {
    case 'daily':
      next.setDate(current.getDate() + (recurrenceInterval || 1));
      console.log('✅ Daily recurrence calculated:', next.toISOString().split('T')[0]);
      break;
      
    case 'weekly':
      next.setDate(current.getDate() + (7 * (recurrenceInterval || 1)));
      console.log('✅ Weekly recurrence calculated:', next.toISOString().split('T')[0]);
      break;
      
    case 'monthly':
      // Fix for monthly: handle month boundaries properly
      const targetMonth = current.getMonth() + (recurrenceInterval || 1);
      next.setMonth(targetMonth);
      
      // Handle case where target day doesn't exist in the new month (e.g., Jan 31 -> Feb 31)
      if (next.getMonth() !== (targetMonth % 12)) {
        // If we overflowed (e.g., Feb 31 became Mar 3), go to last day of target month
        next.setDate(0); // This sets to last day of previous month, which is our target month
      }
      console.log('✅ Monthly recurrence calculated:', next.toISOString().split('T')[0]);
      break;
      
    case 'custom':
      // Fix for custom: ensure interval is a valid number
      const customInterval = parseInt(recurrenceInterval, 10);
      if (isNaN(customInterval) || customInterval < 1) {
        console.error('❌ Invalid custom interval:', recurrenceInterval);
        return null;
      }
      next.setDate(current.getDate() + customInterval);
      console.log('✅ Custom recurrence calculated:', next.toISOString().split('T')[0]);
      break;
      
    default:
      console.error('❌ Invalid recurrence type:', recurrenceType);
      return null;
  }
  
  const result = next.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  console.log('📅 Final calculated date:', result);
  return result;
}

// Create the next instance of a recurring task
async function createNextRecurringInstance(originalTask, actingUserId) {
  try {
    console.log('🔄 Creating next recurring instance for task:', originalTask.task_id);
    console.log('📊 Task recurrence details:', {
      recurrence_type: originalTask.recurrence_type,
      recurrence_interval: originalTask.recurrence_interval,
      current_due_date: originalTask.due_date,
      recurrence_end_date: originalTask.recurrence_end_date,
      original_assignee: originalTask.assignee_id,
      original_status: originalTask.status
    });
    
    // Calculate next due date
    const nextDueDate = calculateNextDueDate(
      originalTask.due_date, 
      originalTask.recurrence_type, 
      originalTask.recurrence_interval
    );
    
    if (!nextDueDate) {
      console.error('❌ Could not calculate next due date');
      return null;
    }
    
    console.log('📅 Next due date calculated:', nextDueDate);
    
    // Check if we've passed the end date (if set)
    if (originalTask.recurrence_end_date && nextDueDate > originalTask.recurrence_end_date) {
      console.log('📅 Recurrence end date reached, stopping recurrence');
      return null;
    }
    
    // Validate required fields
    if (!originalTask.title || !originalTask.owner_id) {
      console.error('❌ Missing required fields for task creation');
      return null;
    }
    
    // ✅ FIX: Determine the correct status based on assignee
    let newStatus = 'UNASSIGNED';
    if (originalTask.assignee_id) {
      // If there was an assignee, set to ONGOING (or whatever the original non-completed status was)
      newStatus = 'ONGOING';
    }
    
    console.log('👤 Assignment details:', {
      original_assignee: originalTask.assignee_id,
      new_status: newStatus
    });
    
    // Create the new task instance
    const newTaskData = {
      title: originalTask.title,
      description: originalTask.description || '',
      status: newStatus, // ✅ Use calculated status instead of hardcoded 'UNASSIGNED'
      priority_bucket: originalTask.priority_bucket || 5,
      due_date: nextDueDate,
      project: originalTask.project || '',
      project_id: originalTask.project_id || null,
      owner_id: originalTask.owner_id,
      assignee_id: originalTask.assignee_id || null, // ✅ Preserve original assignee
      members_id: originalTask.members_id || [],
      parent_task_id: originalTask.parent_task_id || null,
      is_recurring: true,
      recurrence_type: originalTask.recurrence_type,
      recurrence_interval: originalTask.recurrence_interval,
      parent_recurring_task_id: originalTask.parent_recurring_task_id || originalTask.task_id,
      recurrence_end_date: originalTask.recurrence_end_date || null,
      next_due_date: calculateNextDueDate(nextDueDate, originalTask.recurrence_type, originalTask.recurrence_interval),
      is_deleted: false
    };
    
    console.log('📝 Creating new task with data:', {
      task_id: 'NEW',
      title: newTaskData.title,
      status: newTaskData.status,
      assignee_id: newTaskData.assignee_id,
      due_date: newTaskData.due_date
    });
    
    const { data: newTask, error: createErr } = await supabase
      .from('tasks')
      .insert(newTaskData)
      .select()
      .single();
    
    if (createErr) {
      console.error('❌ Error creating recurring task instance:', createErr);
      return null;
    }
    
    console.log('✅ Created recurring task instance:', {
      task_id: newTask.task_id,
      status: newTask.status,
      assignee_id: newTask.assignee_id
    });
    
    // Get subtasks of the completed task
    const { data: subtasks, error: subtasksErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('parent_task_id', originalTask.task_id)
      .eq('is_deleted', false);
    
    if (subtasksErr) {
      console.error('❌ Error fetching subtasks:', subtasksErr);
    } else if (subtasks && subtasks.length > 0) {
      console.log(`🔄 Creating ${subtasks.length} subtasks for recurring instance`);
      
      // Create subtasks for the new instance
      for (const subtask of subtasks) {
        // ✅ FIX: Preserve subtask assignments too
        let subtaskStatus = 'UNASSIGNED';
        if (subtask.assignee_id) {
          subtaskStatus = 'ONGOING';
        }
        
        const newSubtaskData = {
          title: subtask.title,
          description: subtask.description || '',
          status: subtaskStatus, // ✅ Use calculated status
          priority_bucket: newTask.priority_bucket,
          due_date: nextDueDate,
          project: newTask.project,
          project_id: newTask.project_id,
          owner_id: subtask.owner_id,
          assignee_id: subtask.assignee_id || null, // ✅ Preserve subtask assignee
          members_id: subtask.members_id || [],
          parent_task_id: newTask.task_id,
          is_recurring: false,
          is_deleted: false
        };
        
        const { error: subtaskCreateErr } = await supabase
          .from('tasks')
          .insert(newSubtaskData);
        
        if (subtaskCreateErr) {
          console.error('❌ Error creating recurring subtask:', subtaskCreateErr);
        } else {
          console.log('✅ Created recurring subtask:', {
            title: subtask.title,
            assignee_id: subtask.assignee_id,
            status: subtaskStatus
          });
        }
      }
    }
    
    // Log activity for the new recurring instance
    try {
      await recordTaskActivity(supabase, {
        taskId: newTask.task_id,
        authorId: actingUserId,
        type: ActivityTypes.TASK_CREATED,
        metadata: { 
          recurring_instance: true,
          original_task_id: originalTask.parent_recurring_task_id || originalTask.task_id,
          preserved_assignee: originalTask.assignee_id
        },
        summary: `Recurring task instance created automatically${originalTask.assignee_id ? ' with preserved assignment' : ''}`
      });
    } catch (activityErr) {
      console.warn('Warning: Could not log activity for recurring task:', activityErr);
    }
    
    return newTask; 
    
  } catch (error) {
    console.error('❌ Error in createNextRecurringInstance:', error);
    return null;
  }
}


router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, email, full_name, role, access_level, team_id, department_id, created_at')
    .order('user_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Get all projects with access control - UPDATED with team/department logic
router.get('/projects', async (req, res) => {
  console.log('🔥 /projects route HIT!');
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;

  console.log('📊 Projects request - actingUserId:', actingUserId);

  if (Number.isNaN(actingUserId)) {
    console.log('❌ Projects - Invalid acting_user_id');
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  try {
    // Load acting user with team/department info
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level, team_id, department_id')
      .eq('user_id', actingUserId)
      .single();
    
    if (actingErr) {
      console.log('❌ Projects - Error loading acting user:', actingErr);
      return res.status(500).json({ error: actingErr.message });
    }
    if (!acting) {
      console.log('❌ Projects - Acting user not found');
      return res.status(400).json({ error: 'Invalid acting_user_id' });
    }

    console.log('✅ Projects - Acting user loaded:', acting);

    // Get all projects with owner info
    const { data: allProjects, error: projectsErr } = await supabase
      .from('projects')
      .select(`
        *,
        owner:users!owner_id(user_id, access_level, team_id, department_id)
      `)
      .order('project_id');
    
    if (projectsErr) {
      console.log('❌ Projects - Error loading projects:', projectsErr);
      return res.status(500).json({ error: projectsErr.message });
    }

    console.log('📊 Projects - Raw projects data:', allProjects);

    // Apply NEW team/department hierarchy filtering
    let filteredProjects;
    
    if (acting.access_level === 0) {
      // Staff: only see projects they own
      filteredProjects = (allProjects || []).filter(project => project.owner_id === actingUserId);
    } else if (acting.access_level === 1) {
      // Manager: only subordinates (access_level < 1) in same team
      const subordinates = (allProjects || []).filter(project => {
        if (project.owner_id === actingUserId) return true; // Own projects
        const owner = project.owner;
        return owner && owner.team_id === acting.team_id && owner.access_level < 1; // Same team, not manager
      });
      filteredProjects = subordinates;
    } else if (acting.access_level === 2) {
      // Director: only subordinates (access_level < 2) in same department
      filteredProjects = (allProjects || []).filter(project => {
        if (project.owner_id === actingUserId) return true; // Own projects
        const owner = project.owner;
        return owner && owner.department_id === acting.department_id && owner.access_level < 2; // Same department, subordinates only
      });
    } else if (acting.access_level === 3) {
      // HR: see everything
      filteredProjects = allProjects || [];
    } else {
      // Unknown access level - default to own only
      filteredProjects = (allProjects || []).filter(project => project.owner_id === actingUserId);
    }

    console.log(`👑 User with access level ${acting.access_level} - filtered projects:`, filteredProjects);
    return res.json({ data: filteredProjects });
  } catch (error) {
    console.log('❌ Projects - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get individual project with access control
router.get('/projects/:id', async (req, res) => {
  console.log('🔥 /projects/:id route HIT with ID:', req.params.id);
  const projectId = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;

  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  try {
    // Load acting user to check access level
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', actingUserId)
      .single();
    
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

    // Get project with all related tasks using simple JOIN
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('project_id', projectId)
      .single();
    
    if (projectErr) return res.status(500).json({ error: projectErr.message });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Load project owner to compare access levels - same hierarchy logic as tasks
    const { data: owner, error: ownerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', project.owner_id)
      .single();
    
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });

    const isOwner = project.owner_id === actingUserId;
    const outranksOwner = owner && (acting.access_level > owner.access_level);
    const canView = isOwner || outranksOwner;

    if (!canView) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to view this project' });
    }

    // Get related tasks for this project using project_id foreign key
    const { data: projectTasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('task_id, title, status, priority_bucket, due_date, owner_id, assignee_id, members_id, created_at, updated_at, description')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('priority_bucket', { ascending: true });
    
    if (tasksErr) {
      console.error('Error fetching project tasks:', tasksErr);
      // Don't fail the whole request if tasks can't be fetched
    }

    return res.json({ 
      data: {
        ...project,
        related_tasks: projectTasks || []
      }
    });
  } catch (error) {
    console.log('❌ Project detail - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new project (POST /projects) - UPDATED to include owner as member
router.post('/projects', async (req, res) => {
  console.log('🔥 POST /projects route HIT!');
  const { 
    name, 
    description, 
    end_date, 
    owner_id, 
    acting_user_id 
  } = req.body || {};

  if (!name || !owner_id || !acting_user_id) {
    return res.status(400).json({ 
      error: 'Missing required fields: name, owner_id, and acting_user_id are required' 
    });
  }

  try {
    // Load acting user to check permissions - same hierarchy logic as tasks
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', acting_user_id)
      .single();
    
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

    // Check if acting user can create project for the specified owner
    if (owner_id !== acting_user_id) {
      const { data: targetOwner, error: ownerErr } = await supabase
        .from('users')
        .select('user_id, access_level')
        .eq('user_id', owner_id)
        .single();
      
      if (ownerErr) return res.status(500).json({ error: ownerErr.message });
      if (!targetOwner) return res.status(400).json({ error: 'Owner not found' });
      
      if (acting.access_level <= targetOwner.access_level) {
        return res.status(403).json({ error: 'Insufficient permissions to create project for this owner' });
      }
    }

    const insertPayload = {
      name: name.trim(),
      description,
      end_date,
      owner_id,
      tasks: [],
      members: [owner_id], // Owner is always a member by default
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: created, error: createErr } = await supabase
      .from('projects')
      .insert(insertPayload)
      .select()
      .single();
    
    if (createErr) return res.status(500).json({ error: createErr.message });

    return res.json({ success: true, data: created });
  } catch (error) {
    console.log('❌ Create project - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a project (PATCH /projects/:id) - owner only
router.patch('/projects/:id', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });

  const { name, description, end_date, acting_user_id } = req.body || {};
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  try {
    // Load existing project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('project_id', projectId)
      .single();
    if (projectErr) return res.status(500).json({ error: projectErr.message });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Only owner can update (as requested)
    if (project.owner_id !== acting_user_id) {
      return res.status(403).json({ error: 'Only the project owner can update this project' });
    }

    const patch = {};
    if (typeof name === 'string' && name.trim()) patch.name = name.trim();
    if (typeof description === 'string') patch.description = description;
    if (typeof end_date === 'string') patch.end_date = end_date;
    if (end_date === null) patch.end_date = null;
    patch.updated_at = new Date().toISOString();

    if (Object.keys(patch).length === 1) { // only updated_at
      return res.json({ success: true, data: project });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('projects')
      .update(patch)
      .eq('project_id', projectId)
      .select()
      .single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.log('❌ Update project - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tasks', async (req, res) => {
  // Back-compat: single user filter (?user_id=)
  const singleUserId = req.query.user_id ? parseInt(req.query.user_id, 10) : NaN;

  // New: access-aware multi-user filter
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const userIdsParam = (req.query.user_ids || '').toString();
  const requestedUserIds = userIdsParam
    ? userIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n))
    : [];
  const hasUserIdsParam = Object.prototype.hasOwnProperty.call(req.query, 'user_ids');

  console.log('🔥 Tasks request:', {
    actingUserId,
    requestedUserIds,
    hasUserIdsParam,
    singleUserId
  });

  // If acting user provided, enforce NEW team/department access rules
  if (!Number.isNaN(actingUserId)) {
    const { data: actingData, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level, team_id, department_id, full_name')
      .eq('user_id', actingUserId)
      .single();
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!actingData) return res.status(400).json({ error: 'Invalid acting_user_id' });

    console.log('👤 Acting user:', actingData);

    // Get all users with team/department info
    const { data: allUsers, error: usersErr } = await supabase
      .from('users')
      .select('user_id, access_level, team_id, department_id, full_name');
    if (usersErr) return res.status(500).json({ error: usersErr.message });

    console.log('👥 All users loaded:', allUsers.length);

    // FIXED: Managers only see subordinates (not peer managers)
    let allowedTargetIds = new Set([actingUserId]); // Always include self

    if (actingData.access_level === 0) {
      // Staff: only own tasks
      allowedTargetIds = new Set([actingUserId]);
      console.log('👤 Staff access - only self');
    } else if (actingData.access_level === 1) {
      // Manager: only subordinates (access_level < 1) in same team
      const subordinates = allUsers.filter(u => 
        u.team_id === actingData.team_id && 
        u.team_id !== null &&
        u.access_level < actingData.access_level // Only staff (level 0)
      );
      allowedTargetIds = new Set([actingUserId, ...subordinates.map(u => u.user_id)]);
      console.log('👥 Manager access - subordinates only:', subordinates.map(u => u.full_name));
    } else if (actingData.access_level === 2) {
      // Director: only subordinates (access_level < 2) in same department
      const subordinates = allUsers.filter(u => 
        u.department_id === actingData.department_id && 
        u.department_id !== null &&
        u.access_level < actingData.access_level // Only managers and staff (levels 0,1)
      );
      allowedTargetIds = new Set([actingUserId, ...subordinates.map(u => u.user_id)]);
      console.log('🏢 Director access - subordinates only:', subordinates.map(u => u.full_name));
    } else if (actingData.access_level === 3) {
      // HR: everyone
      allowedTargetIds = new Set(allUsers.map(u => u.user_id));
      console.log('👑 HR access - everyone');
    }

    const candidateTargets = hasUserIdsParam ? requestedUserIds : [actingUserId];
    const effectiveTargets = candidateTargets.filter((id) => allowedTargetIds.has(id));

    console.log('🎯 Effective targets:', effectiveTargets);

    if (effectiveTargets.length === 0) return res.json({ data: [] });

    // Fetch tasks where owner is in targets OR members array contains any target id
    // First get owners
    const { data: ownerTasks, error: ownerErr } = await supabase
      .from('tasks')
      .select('*')
      .in('owner_id', effectiveTargets)
      .eq('is_deleted', false);
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });

    // Then get member tasks using Postgres ANY/overlap operator
    const { data: memberTasks, error: memberErr } = await supabase
      .from('tasks')
      .select('*')
      .overlaps('members_id', effectiveTargets)
      .eq('is_deleted', false);
    if (memberErr) return res.status(500).json({ error: memberErr.message });

    console.log('📊 Tasks found:', {
      ownerTasks: ownerTasks?.length || 0,
      memberTasks: memberTasks?.length || 0
    });

    // Merge, de-dupe by task_id
    const map = new Map();
    [...(ownerTasks || []), ...(memberTasks || [])].forEach((t) => map.set(t.task_id, t));
    return res.json({ data: Array.from(map.values()).map((t) => ({ ...t, status: mapLegacyStatus(t.status) })) });
  }

  // Fallback: single user view
  if (!Number.isNaN(singleUserId)) {
    const { data: ownerTasks, error: ownerErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_deleted', false)
      .eq('owner_id', singleUserId);
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });

    const { data: memberTasks, error: memberErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_deleted', false)
      .contains('members_id', [singleUserId]);
    if (memberErr) return res.status(500).json({ error: memberErr.message });

    const map = new Map();
    [...ownerTasks, ...memberTasks].forEach((t) => map.set(t.task_id, t));
    return res.json({ data: Array.from(map.values()).map((t) => ({ ...t, status: mapLegacyStatus(t.status) })) });
  }

  // Default: return all non-deleted tasks
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_deleted', false)
    .order('task_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map((t) => ({ ...t, status: mapLegacyStatus(t.status) })) });
});

// Return all tasks tied to a specified user (owner, assignee, or member).
router.get('/tasks/by-user/:userId', async (req, res) => {
  const targetUserId = parseInt(req.params.userId, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;

  if (Number.isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  const { data: actingUser, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .single();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!actingUser) return res.status(400).json({ error: 'Invalid acting_user_id' });

  if (actingUserId !== targetUserId) {
    const { data: targetUser, error: targetErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', targetUserId)
      .single();

    if (targetErr) return res.status(500).json({ error: targetErr.message });
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    if (actingUser.access_level <= targetUser.access_level) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to view this user\'s tasks' });
    }
  }

  try {
    const [
      { data: ownerTasks, error: ownerErr },
      { data: assigneeTasks, error: assigneeErr },
      { data: memberTasks, error: memberErr },
    ] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('is_deleted', false)
        .eq('owner_id', targetUserId),
      supabase
        .from('tasks')
        .select('*')
        .eq('is_deleted', false)
        .eq('assignee_id', targetUserId),
      supabase
        .from('tasks')
        .select('*')
        .eq('is_deleted', false)
        .contains('members_id', [targetUserId]),
    ]);

    if (ownerErr || assigneeErr || memberErr) {
      const err = ownerErr || assigneeErr || memberErr;
      return res.status(500).json({ error: err.message });
    }

    const merged = new Map();
    [...(ownerTasks || []), ...(assigneeTasks || []), ...(memberTasks || [])].forEach((task) => {
      merged.set(task.task_id, task);
    });

    return res.json({
      data: Array.from(merged.values()).map((task) => ({
        ...task,
        status: mapLegacyStatus(task.status),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Return all tasks with due dates for a specific user, including their role(s) on each task
router.get('/tasks/by-user/:userId/deadlines', async (req, res) => {
  const targetUserId = parseInt(req.params.userId, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;

  if (Number.isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  const { data: actingUser, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .single();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!actingUser) return res.status(400).json({ error: 'Invalid acting_user_id' });

  let projectMembershipAllows = false;
  const projectIdParam = req.query.project_id ? parseInt(req.query.project_id, 10) : NaN;

  if (!Number.isNaN(projectIdParam)) {
    const { data: project } = await supabase
      .from('projects')
      .select('project_id, owner_id, members')
      .eq('project_id', projectIdParam)
      .single();

    if (project) {
      const memberSet = new Set();
      if (project.owner_id) memberSet.add(project.owner_id);
      if (Array.isArray(project.members)) {
        project.members.forEach((id) => {
          if (typeof id === 'number') memberSet.add(id);
        });
      }

      if (memberSet.has(actingUserId) && memberSet.has(targetUserId)) {
        projectMembershipAllows = true;
      }
    }
  }

  if (actingUserId !== targetUserId && !projectMembershipAllows) {
    const { data: targetUser, error: targetErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', targetUserId)
      .single();

    if (targetErr) return res.status(500).json({ error: targetErr.message });
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    if (actingUser.access_level <= targetUser.access_level) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to view this user\'s deadlines' });
    }
  }

  try {
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('*')
      .or(`owner_id.eq.${targetUserId},assignee_id.eq.${targetUserId},members_id.cs.{${targetUserId}}`)
      .eq('is_deleted', false)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (tasksErr) {
      return res.status(500).json({ error: tasksErr.message });
    }

    const data = (tasks || []).map((task) => {
      const roles = [];
      if (task.owner_id === targetUserId) roles.push('owner');
      if (task.assignee_id === targetUserId) roles.push('assignee');
      if (Array.isArray(task.members_id) && task.members_id.includes(targetUserId)) roles.push('member');

      return {
        task_id: task.task_id,
        title: task.title,
        due_date: task.due_date,
        priority_bucket: task.priority_bucket,
        roles,
        status: mapLegacyStatus(task.status),
      };
    });

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new task (POST /tasks)
router.post('/tasks', async (req, res) => {
  const {
    title,
    description, 
    status = 'UNASSIGNED', 
    priority_bucket, 
    due_date, 
    project, 
    project_id, // Add support for direct project_id
    owner_id, 
    assignee_id = null,
    members_id = [], 
    parent_task_id = null,
    acting_user_id, 
    // NEW: Recurrence fields
    is_recurring = false,
    recurrence_type = null,
    recurrence_interval = null,
    recurrence_end_date = null
  } = req.body || {};

  if (!title || !owner_id || !acting_user_id) {
    return res.status(400).json({ 
      error: 'Missing required fields: title, owner_id, and acting_user_id are required' 
    });
  }
  if (!due_date || String(due_date).trim() === '') {
    return res.status(400).json({ error: 'due_date is required' });
  }
  if (!(Number.isInteger(priority_bucket) && priority_bucket >= 1 && priority_bucket <= 10)) {
    return res.status(400).json({ error: 'priority_bucket must be an integer between 1 and 10' });
  }

  // Validate recurrence fields
  if (is_recurring) {
    const validRecurrenceTypes = ['daily', 'weekly', 'monthly', 'custom'];
    if (!recurrence_type || !validRecurrenceTypes.includes(recurrence_type)) {
      return res.status(400).json({ error: 'Valid recurrence_type is required for recurring tasks' });
    }
    
    if (recurrence_type === 'custom' && (!recurrence_interval || recurrence_interval < 1)) {
      return res.status(400).json({ error: 'recurrence_interval must be >= 1 for custom recurrence' });
    }
    
    if (recurrence_end_date && recurrence_end_date <= due_date) {
      return res.status(400).json({ error: 'recurrence_end_date must be after due_date' });
    }
  }



  // Load acting user (to allow creating tasks for self or for users they outrank)
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', acting_user_id)
    .maybeSingle();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  if (owner_id !== acting_user_id) {
    const { data: targetOwner, error: ownerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', owner_id)
      .maybeSingle();
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });
    if (!targetOwner) return res.status(400).json({ error: 'Owner not found' });
    if (!(acting.access_level > targetOwner.access_level)) {
      return res.status(403).json({ error: 'Insufficient permissions to create task for this owner' });
    }
  }

  // Auto-find project_id if project name is provided but project_id is not
  let finalProjectId = project_id || null;
  if (!finalProjectId && project && project.trim()) {
    console.log(`🔍 Looking up project by name: "${project.trim()}"`);
    const { data: foundProject, error: projectErr } = await supabase
      .from('projects')
      .select('project_id')
      .eq('name', project.trim())
      .maybeSingle();
    
    if (projectErr) {
      console.error('❌ Error looking up project:', projectErr);
    } else if (foundProject) {
      finalProjectId = foundProject.project_id;
      console.log(`✅ Found project: "${project.trim()}" -> ID ${finalProjectId}`);
    } else {
      console.log(`⚠️ Project not found: "${project.trim()}"`);
    }
  }

  // Compute effective status based on assignee
  const effectiveStatus = assignee_id == null ? 'UNASSIGNED' : (status === 'UNASSIGNED' ? 'ONGOING' : status);

  // Calculate next_due_date for recurring tasks
  let nextDueDate = null;
  if (is_recurring) {
    nextDueDate = calculateNextDueDate(due_date, recurrence_type, recurrence_interval);
  }

  const insertPayload = {
    title,
    description,
    status: effectiveStatus,
    priority_bucket,
    due_date,
    project,
    project_id: finalProjectId, // Use the found or provided project_id
    owner_id,
    assignee_id,
    members_id,
    parent_task_id,
    // NEW: Recurrence fields
    is_recurring,
    recurrence_type: is_recurring ? recurrence_type : null,
    recurrence_interval: is_recurring ? (recurrence_interval || 1) : null,
    recurrence_end_date: is_recurring ? recurrence_end_date : null,
    next_due_date: nextDueDate,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('📝 Creating task with payload:', {
    ...insertPayload,
    project_linked: finalProjectId ? 'YES' : 'NO'
  });

  const { data: created, error: createErr } = await supabase
    .from('tasks')
    .insert(insertPayload)
    .select()
    .single();
  if (createErr) return res.status(500).json({ error: createErr.message });


  // Activity: created and optional reassignment
  try {
    await recordTaskActivity(supabase, {
      taskId: created.task_id,
      authorId: acting_user_id,
      type: ActivityTypes.TASK_CREATED,
    });
    if (created.assignee_id != null) {
      await recordTaskActivity(supabase, {
        taskId: created.task_id,
        authorId: acting_user_id,
        type: ActivityTypes.REASSIGNED,
        metadata: { from_assignee: null, to_assignee: created.assignee_id },
      });
      // Email: notify new assignee
      try { await notifyTaskAssigned(supabase, created, created.assignee_id); } catch (_) {}
    }
  } catch (_) {}


  return res.json({ success: true, data: created });
});

// Create a subtask (POST /tasks/:id/subtask)
router.post('/tasks/:id/subtask', async (req, res) => {
  const parentTaskId = parseInt(req.params.id, 10);
  const { 
    title, 
    description, 
    status, 
    due_date, 
    project, 
    owner_id, 
    assignee_id = null,
    members_id = [], 
    acting_user_id 
  } = req.body;

  if (Number.isNaN(parentTaskId)) {
    return res.status(400).json({ error: 'Invalid parent task ID' });
  }

  if (!title || !owner_id || !acting_user_id) {
    return res.status(400).json({ 
      error: 'Missing required fields: title, owner_id, and acting_user_id are required' 
    });
  }
  if (!due_date || String(due_date).trim() === '') {
    return res.status(400).json({ error: 'due_date is required' });
  }

  // Validate status
  const validStatuses = ['UNASSIGNED', 'ONGOING', 'UNDER_REVIEW', 'COMPLETED'];
  const effectiveStatus = assignee_id == null ? 'UNASSIGNED' : (status && validStatuses.includes(status) ? status : 'ONGOING');

  // Load acting user to check permissions
  const { data: actingUser, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', acting_user_id)
    .single();
  
  if (actingErr) {
    return res.status(500).json({ error: 'Failed to verify acting user' });
  }
  if (!actingUser) {
    return res.status(404).json({ error: 'Acting user not found' });
  }

  // Verify parent task exists and check permissions
  const { data: parentTask, error: parentErr } = await supabase
    .from('tasks')
    .select('task_id, title, owner_id, project, priority_bucket')
    .eq('task_id', parentTaskId)
    .eq('is_deleted', false)
    .single();
  
  if (parentErr) {
    return res.status(500).json({ error: 'Failed to verify parent task' });
  }
  if (!parentTask) {
    return res.status(404).json({ error: 'Parent task not found' });
  }

  // Check if acting user can create subtask (must be owner or have higher access level than parent task owner)
  if (parentTask.owner_id !== acting_user_id) {
    const { data: parentOwner, error: parentOwnerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', parentTask.owner_id)
      .single();
    
    if (parentOwnerErr) {
      return res.status(500).json({ error: 'Failed to verify parent task owner' });
    }
    if (!parentOwner) {
      return res.status(404).json({ error: 'Parent task owner not found' });
    }

    if (actingUser.access_level <= parentOwner.access_level) {
      return res.status(403).json({ error: 'Insufficient permissions to create subtask for this task' });
    }
  }

  // If subtask owner is different from acting user, check permissions
  if (owner_id !== acting_user_id) {
    const { data: targetOwner, error: ownerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', owner_id)
      .single();
    
    if (ownerErr) {
      return res.status(500).json({ error: 'Failed to verify target owner' });
    }
    if (!targetOwner) {
      return res.status(404).json({ error: 'Target owner not found' });
    }

    if (actingUser.access_level <= targetOwner.access_level) {
      return res.status(403).json({ error: 'Insufficient permissions to create task for this user' });
    }
  }

  // Inherit project and priority from parent task unconditionally at creation
  const taskProject = project || parentTask.project;
  const taskPriorityBucket = parentTask.priority_bucket;

  // Auto-find project_id for subtask if parent has project info
  let subtaskProjectId = null;
  if (parentTask.project_id) {
    // Inherit parent's project_id directly
    subtaskProjectId = parentTask.project_id;
  } else if (taskProject && taskProject.trim()) {
    // Look up project by name
    const { data: foundProject } = await supabase
      .from('projects')
      .select('project_id')
      .eq('name', taskProject.trim())
      .maybeSingle();
    if (foundProject) {
      subtaskProjectId = foundProject.project_id;
    }
  }

  // Create the subtask
  const { data: newSubtask, error: createErr } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      status: effectiveStatus,
      priority_bucket: taskPriorityBucket,
      due_date,
      project: taskProject,
      project_id: subtaskProjectId, // Link to project
      owner_id,
      assignee_id,
      members_id,
      parent_task_id: parentTaskId,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (createErr) {
    return res.status(500).json({ error: 'Failed to create subtask', details: createErr.message });
  }

  // Activity: created and optional reassignment
  try {
    await recordTaskActivity(supabase, {
      taskId: newSubtask.task_id,
      authorId: acting_user_id,
      type: ActivityTypes.TASK_CREATED,
    });
    if (newSubtask.assignee_id != null) {
      await recordTaskActivity(supabase, {
        taskId: newSubtask.task_id,
        authorId: acting_user_id,
        type: ActivityTypes.REASSIGNED,
        metadata: { from_assignee: null, to_assignee: newSubtask.assignee_id },
      });
      // Email: notify new subtask assignee
      try { await notifyTaskAssigned(supabase, newSubtask, newSubtask.assignee_id); } catch (_) {}
    }
  } catch (_) {}

  return res.json({ 
    success: true, 
    message: `Subtask "${title}" created successfully under "${parentTask.title}"`,
    data: newSubtask
  });
});

// Get deleted tasks (Trash view) - UPDATED with team/department logic
router.get('/tasks/deleted', async (req, res) => {
  console.log('🔥 /tasks/deleted route HIT!');
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const project = req.query.project;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  console.log('🗑️ DELETED TASKS - Raw query:', req.query);
  console.log('🗑️ DELETED TASKS - Parsed actingUserId:', actingUserId);

  if (Number.isNaN(actingUserId)) {
    console.log('🗑️ DELETED TASKS - Returning 400: acting_user_id is NaN');
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  // Load acting user with team/department info
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level, team_id, department_id')
    .eq('user_id', actingUserId)
    .single();
  
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Build query for deleted tasks with owner info
  let query = supabase
    .from('tasks')
    .select(`
      task_id, title, description, status, priority_bucket, due_date, project, owner_id, members_id, parent_task_id, deleted_at, deleted_by, created_at,
      owner:users!owner_id(user_id, access_level, team_id, department_id)
    `)
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false });

  // Apply filters
  if (project) {
    query = query.eq('project', project);
  }
  if (startDate) {
    query = query.gte('deleted_at', startDate);
  }
  if (endDate) {
    query = query.lte('deleted_at', endDate);
  }

  const { data: deletedTasks, error: tasksErr } = await query;
  if (tasksErr) return res.status(500).json({ error: tasksErr.message });

  // NEW: Filter tasks based on team/department hierarchy
  let filtered;
  
  if (acting.access_level === 0) {
    // Staff: only see own tasks
    filtered = deletedTasks.filter(task => task.owner_id === actingUserId);
  } else if (acting.access_level === 1) {
    // Manager: see tasks from same team
    filtered = deletedTasks.filter(task => {
      if (task.owner_id === actingUserId) return true; // Own tasks
      const owner = task.owner;
      return owner && owner.team_id === acting.team_id && owner.access_level < 1; // Same team, not manager
    });
  } else if (acting.access_level === 2) {
    // Director: only subordinates (access_level < 2) in same department
    filtered = deletedTasks.filter(task => {
      if (task.owner_id === actingUserId) return true; // Own tasks
      const owner = task.owner;
      return owner && owner.department_id === acting.department_id && owner.access_level < 2; // Same department, subordinates only
    });
  } else if (acting.access_level === 3) {
    // HR: see everything
    filtered = deletedTasks;
  } else {
    // Unknown access level - default to own only
    filtered = deletedTasks.filter(task => task.owner_id === actingUserId);
  }

  return res.json({ data: filtered });
});

// Return a single task with access checks via acting_user_id
router.get('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  // Load acting user access
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .single();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Load task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', id)
    .eq('is_deleted', false)
    .single();
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Load owner to compare access levels
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .single();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && (acting.access_level > owner.access_level);
  const canView = isOwner || isMember || outranksOwner;
  if (!canView) return res.status(403).json({ error: 'Forbidden' });

  return res.json({ data: { ...task, status: mapLegacyStatus(task.status) } });
});

// Return ancestor chain for a task (minimal fields), regardless of access filters
router.get('/tasks/:id/ancestors', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });

  // First get the selected task to know its parent
  const { data: current, error: curErr } = await supabase
    .from('tasks')
    .select('task_id, title, parent_task_id')
    .eq('task_id', id)
    .single();
  if (curErr) return res.status(500).json({ error: curErr.message });
  if (!current) return res.status(404).json({ error: 'Task not found' });

  const chain = [];
  const visited = new Set([id]);
  let parentId = current.parent_task_id;
  while (parentId != null) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const { data: parent, error: pErr } = await supabase
      .from('tasks')
      .select('task_id, title, parent_task_id')
      .eq('task_id', parentId)
      .single();
    if (pErr) return res.status(500).json({ error: pErr.message });
    if (!parent) break;
    chain.push({ task_id: parent.task_id, title: parent.title, parent_task_id: parent.parent_task_id });
    parentId = parent.parent_task_id;
  }

  chain.reverse();
  return res.json({ data: chain });
});

// Return all descendants (subtasks, recursively) of a task, minimal fields
router.get('/tasks/:id/descendants', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });

  // Ensure the root task exists
  const { data: root, error: rootErr } = await supabase
    .from('tasks')
    .select('task_id')
    .eq('task_id', id)
    .single();
  if (rootErr) return res.status(500).json({ error: rootErr.message });
  if (!root) return res.status(404).json({ error: 'Task not found' });

  const results = [];
  const queue = [id];
  const visited = new Set([id]);
  // BFS to gather all descendants
  while (queue.length) {
    const parentId = queue.shift();
    const { data: children, error: childErr } = await supabase
      .from('tasks')
      .select('task_id, title, parent_task_id')
      .eq('parent_task_id', parentId)
      .eq('is_deleted', false);
    if (childErr) return res.status(500).json({ error: childErr.message });
    for (const c of (children || [])) {
      if (visited.has(c.task_id)) continue;
      visited.add(c.task_id);
      results.push(c);
      queue.push(c.task_id);
    }
  }

  return res.json({ data: results });
});

// TASK ATTACHMENT ROUTES

// Helper function to check task access (reuse your existing logic)
async function checkTaskAccess(taskId, actingUserId) {
  // Load acting user
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .single();
  if (actingErr || !acting) return false;

  // Load task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', taskId)
    .eq('is_deleted', false)
    .single();
  if (taskErr || !task) return false;

  // Load task owner
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .single();
  if (ownerErr) return false;

  // Check access (same logic as your task routes)
  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && (acting.access_level > owner.access_level);
  
  return isOwner || isMember || outranksOwner;
}

// Upload attachment to task
router.post('/tasks/:taskId/attachments', upload.single('file'), async (req, res) => {
  console.log('Upload route hit for task:', req.params.taskId);
  console.log('Request file:', req.file);
  console.log('Request body:', req.body);

  const taskId = parseInt(req.params.taskId, 10);
  const actingUserId = parseInt(req.body.acting_user_id, 10);
  
  if (Number.isNaN(taskId) || Number.isNaN(actingUserId)) {
    console.log('Invalid parameters:', { taskId, actingUserId });
    return res.status(400).json({ error: 'Invalid task ID or acting_user_id' });
  }

  if (!req.file) {
    console.log('No file provided');
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    // Check task access
    const hasAccess = await checkTaskAccess(taskId, actingUserId);
    if (!hasAccess) {
      console.log('Access denied for user:', actingUserId, 'task:', taskId);
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = req.file.originalname.split('.').pop() || 'bin';
    const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const filePath = `task_${taskId}/${fileName}`;

    console.log('Uploading to path:', filePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('task-attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: `Failed to upload file: ${uploadError.message}` });
    }

    console.log('File uploaded successfully:', uploadData);

    // Save attachment record
    const { data: attachment, error: dbError } = await supabase
      .from('task_attachments')
      .insert({
        task_id: taskId,
        file_name: fileName,
        original_name: req.file.originalname,
        file_path: filePath,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: actingUserId
      })
      .select(`
        *,
        uploader:users!uploaded_by(full_name, email)
      `)
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Clean up uploaded file
      await supabase.storage.from('task-attachments').remove([filePath]);
      return res.status(500).json({ error: `Failed to save attachment: ${dbError.message}` });
    }

    console.log('Attachment saved successfully:', attachment);
    res.json({ success: true, data: attachment });

  } catch (error) {
    console.error('Attachment upload error:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Get attachments for a task
router.get('/tasks/:taskId/attachments', async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const actingUserId = parseInt(req.query.acting_user_id, 10);

  if (Number.isNaN(taskId) || Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'Invalid task ID or acting_user_id' });
  }

  // Check task access using existing logic
  const hasAccess = await checkTaskAccess(taskId, actingUserId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'No access to this task' });
  }

  try {
    const { data: attachments, error } = await supabase
      .from('task_attachments')
      .select(`
        *,
        uploader:users!uploaded_by(full_name, email)
      `)
      .eq('task_id', taskId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch attachments' });
    }

    res.json({ success: true, data: attachments || [] });
  } catch (error) {
    console.error('Fetch attachments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download attachment (returns signed URL)
router.get('/tasks/:taskId/attachments/:attachmentId/download', async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);
  const actingUserId = parseInt(req.query.acting_user_id, 10);

  if (Number.isNaN(taskId) || Number.isNaN(attachmentId) || Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Check task access
  const hasAccess = await checkTaskAccess(taskId, actingUserId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'No access to this task' });
  }

  try {
    // Get attachment info
    const { data: attachment, error: attachmentError } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('attachment_id', attachmentId)
      .eq('task_id', taskId)
      .single();

    if (attachmentError || !attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Generate signed URL
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('task-attachments')
      .createSignedUrl(attachment.file_path, 3600); // 1 hour

    if (urlError) {
      return res.status(500).json({ error: 'Failed to generate download link' });
    }

    res.json({
      success: true,
      data: {
        download_url: signedUrl.signedUrl,
        filename: attachment.original_name,
        size: attachment.file_size,
        mime_type: attachment.mime_type
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete attachment (only uploader can delete)
router.delete('/tasks/:taskId/attachments/:attachmentId', async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);
  const actingUserId = parseInt(req.body.acting_user_id, 10);

  if (Number.isNaN(taskId) || Number.isNaN(attachmentId) || Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Check task access
  const hasAccess = await checkTaskAccess(taskId, actingUserId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'No access to this task' });
  }

  try {
    // Get attachment
    const { data: attachment, error: attachmentError } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('attachment_id', attachmentId)
      .eq('task_id', taskId)
      .single();

    if (attachmentError || !attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Only uploader can delete
    if (attachment.uploaded_by !== actingUserId) {
      return res.status(403).json({ error: 'Can only delete your own attachments' });
    }

    // Delete from storage
    await supabase.storage.from('task-attachments').remove([attachment.file_path]);

    // Delete from database
    const { error: dbError } = await supabase
      .from('task_attachments')
      .delete()
      .eq('attachment_id', attachmentId);

    if (dbError) {
      return res.status(500).json({ error: 'Failed to delete attachment' });
    }

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get activity logs for a task (chronological, with optional pagination)
router.get('/tasks/:id/activity', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const limit = req.query.limit ? Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50)) : 50;
  const offset = req.query.offset ? Math.max(0, parseInt(req.query.offset, 10) || 0) : 0;

  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  // Access check: reuse the same logic as fetching a single task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', id)
    .maybeSingle();
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .maybeSingle();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .maybeSingle();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && (acting.access_level > owner.access_level);
  const canView = isOwner || isMember || outranksOwner;
  if (!canView) return res.status(403).json({ error: 'Forbidden' });

  // Fetch logs and enrich authors
  const { data: logs, error: logsErr } = await supabase
    .from('task_activity_logs')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: true })
    .range(offset, offset + (limit - 1));
  if (logsErr) return res.status(500).json({ error: logsErr.message });

  const authorIds = Array.from(new Set((logs || []).map((l) => l.author_id).filter((v) => Number.isInteger(v))));
  let usersById = {};
  if (authorIds.length) {
    const { data: authors, error: authorsErr } = await supabase
      .from('users')
      .select('user_id, full_name, email, role')
      .in('user_id', authorIds);
    if (!authorsErr && Array.isArray(authors)) {
      usersById = Object.fromEntries(authors.map((u) => [u.user_id, u]));
    }
  }

  // Collect referenced user IDs inside metadata to replace IDs with names in summaries
  const referencedUserIds = new Set();
  for (const row of (logs || [])) {
    const meta = (row && row.metadata) || {};
    if (row.type === 'reassigned') {
      if (Number.isInteger(meta.from_assignee)) referencedUserIds.add(meta.from_assignee);
      if (Number.isInteger(meta.to_assignee)) referencedUserIds.add(meta.to_assignee);
    }
    if (row.type === 'field_edited') {
      const field = meta.field;
      if (field === 'owner_id') {
        if (Number.isInteger(meta.from)) referencedUserIds.add(meta.from);
        if (Number.isInteger(meta.to)) referencedUserIds.add(meta.to);
      }
      if (field === 'members_id') {
        const fromArr = Array.isArray(meta.from) ? meta.from : [];
        const toArr = Array.isArray(meta.to) ? meta.to : [];
        for (const v of fromArr) if (Number.isInteger(v)) referencedUserIds.add(v);
        for (const v of toArr) if (Number.isInteger(v)) referencedUserIds.add(v);
      }
    }
  }
  const idsToFetch = Array.from(referencedUserIds).filter((id) => !usersById[id]);
  if (idsToFetch.length) {
    const { data: refUsers, error: refErr } = await supabase
      .from('users')
      .select('user_id, full_name, email, role')
      .in('user_id', idsToFetch);
    if (!refErr && Array.isArray(refUsers)) {
      for (const u of refUsers) usersById[u.user_id] = u;
    }
  }

  const nameFor = (uid) => {
    if (uid == null) return 'Unassigned';
    const u = usersById[uid];
       return (u && u.full_name) ? u.full_name : `User ${uid}`;
  };

  const serialized = (logs || []).map((row) => {
    const meta = row.metadata || {};
    let summary = row.summary;
    if (row.type === 'reassigned') {
      const fromName = nameFor(meta.from_assignee);
      const toName = nameFor(meta.to_assignee);
      summary = `Reassigned: ${fromName} → ${toName}`;
    } else if (row.type === 'field_edited') {
      const field = meta.field;
      if (field === 'owner_id') {
        summary = `Edited owner: ${nameFor(meta.from)} → ${nameFor(meta.to)}`;
      } else if (field === 'members_id') {
        const fromArr = Array.isArray(meta.from) ? Array.from(new Set(meta.from)) : [];
        const toArr = Array.isArray(meta.to) ? Array.from(new Set(meta.to)) : [];
        const fromSet = new Set(fromArr);
        const toSet = new Set(toArr);
        const added = toArr.filter((id) => !fromSet.has(id));
        const removed = fromArr.filter((id) => !toSet.has(id));
        const parts = [];
        if (added.length) parts.push(`Added ${added.map(nameFor).join(', ')}`);
        if (removed.length) parts.push(`Removed ${removed.map(nameFor).join(', ')}`);
        summary = parts.length ? `Members updated: ${parts.join('; ')}` : 'Members unchanged';
      }
    }
    return {
      id: row.log_id,
      taskId: row.task_id,
      authorId: row.author_id,
      author: row.author_id ? usersById[row.author_id] || null : null,
           type: row.type,
      summary,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  });

  return res.json({ data: serialized, page: { limit, offset, total: serialized.length } });
});

// Post a new comment into the activity log for a task
router.post('/tasks/:id/comments', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { acting_user_id, comment } = req.body || {};
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });
  const trimmed = (comment || '').toString().trim();
  if (!trimmed) return res.status(400).json({ error: 'comment is required' });

  // Basic access check: user must be able to view the task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', id)
    .maybeSingle();
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', acting_user_id)
    .maybeSingle();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .maybeSingle();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === acting_user_id;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(acting_user_id);
  const outranksOwner = owner && acting.access_level > owner.access_level;
  const canView = isOwner || isMember || outranksOwner;
  if (!canView) return res.status(403).json({ error: 'Forbidden' });

  // Persist as activity log
  try {
    await recordTaskActivity(supabase, {
      taskId: id,
      authorId: acting_user_id,
      type: ActivityTypes.COMMENT_ADDED,
      metadata: { comment_preview: trimmed.slice(0, 140) },
      summary: `Comment: ${trimmed.slice(0, 140)}`,
    });
  } catch (_) {}

  return res.json({ success: true });
});

// Update task priority (PUT /tasks/:id/priority) - Manager/Director only
router.put('/tasks/:id/priority', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id, priority_bucket } = req.body;
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });
  if (!(Number.isInteger(priority_bucket) && priority_bucket >= 1 && priority_bucket <= 10)) {
    return res.status(400).json({ error: 'priority_bucket must be an integer between 1 and 10' });
  }

  // Load acting user to check permissions
  const { data: actingUser, error: actingErr } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', acting_user_id)
    .single();
  
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!actingUser) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Load the task to check if it exists and get current details
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('task_id, title, owner_id, priority_bucket, is_deleted')
    .eq('task_id', taskId)
    .single();
  
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.is_deleted) return res.status(400).json({ error: 'Cannot modify deleted task' });

  // Only owner can change priority
  if (task.owner_id !== acting_user_id) {
    return res.status(403).json({ error: 'Only the task owner can change the priority' });
  }

  // Update the task priority
  const { error: updateErr, data: updatedTask } = await supabase
    .from('tasks')
    .update({ priority_bucket, updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Activity: priority changed
  try {
    await recordTaskActivity(supabase, {
      taskId,
      authorId: acting_user_id,
      type: ActivityTypes.FIELD_EDITED,
      metadata: { field: 'priority_bucket', from: task.priority_bucket, to: priority_bucket },
    });
  } catch (_) {}

  return res.json({ 
    success: true, 
    message: `Task "${task.title}" priority updated to P${priority_bucket}`,
    data: updatedTask
  });
});



// Soft delete a task (POST /tasks/:id/delete)
router.post('/tasks/:id/delete', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id } = req.body;
  
  console.log('🔥 DELETE REQUEST:', { taskId, acting_user_id });
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  // Load the task to check ownership and current status
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('task_id, title, owner_id, is_deleted')
    .eq('task_id', taskId)
    .single();
  
  console.log('Found task:', task, 'Error:', taskErr);
  
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.is_deleted) return res.status(400).json({ error: 'Task is already deleted' });

  // Check if acting user is the task owner
  if (task.owner_id !== acting_user_id) {
    return res.status(403).json({ error: 'Only the task owner can delete this task' });
  }

  // Get all descendant tasks first to check if there are any
  const descendants = [];
  const queue = [taskId];
  const visited = new Set([taskId]);
  
  while (queue.length) {
    const parentId = queue.shift();
    const { data: children, error: childErr } = await supabase
      .from('tasks')
      .select('task_id, title')
      .eq('parent_task_id', parentId)
      .eq('is_deleted', false);
    
    if (childErr) return res.status(500).json({ error: childErr.message });
    
    for (const child of (children || [])) {
      if (visited.has(child.task_id)) continue;
      visited.add(child.task_id);
      descendants.push(child);
      queue.push(child.task_id);
    }
  }

  console.log('🔥 DESCENDANTS FOUND:', descendants); // ADD THIS

  // Perform soft delete on the main task and all descendants
  const tasksToDelete = [taskId, ...descendants.map(d => d.task_id)];
  
  console.log('🔥 TASKS TO DELETE:', tasksToDelete); // ADD THIS

  const { error: deleteErr, data: updateResult } = await supabase
    .from('tasks')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: acting_user_id
    })
    .in('task_id', tasksToDelete)
    .select();

  console.log('🔥 UPDATE RESULT:', updateResult);
  console.log('🔥 DELETE ERROR:', deleteErr);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  // Activity: task deleted for each affected task
  try {
    await recordMultipleTaskActivities(supabase, tasksToDelete.map((tid) => ({
      taskId: tid,
      authorId: acting_user_id,
      type: ActivityTypes.TASK_DELETED,
    })));
  } catch (_) {}

  console.log('🔥 DELETE SUCCESS - Updated tasks:', tasksToDelete.length); // ADD THIS


  // Update project tasks arrays for any projects that had tasks deleted
  if (updateResult && updateResult.length > 0) {
    const projectIds = new Set();
    updateResult.forEach(task => {
      if (task.project_id) projectIds.add(task.project_id);
    });
    
    // Update each affected project's tasks array
    for (const projectId of projectIds) {
      await updateProjectTasksArray(projectId);
    }
  }


  return res.json({ 
    success: true, 
    message: `Task "${task.title}" and ${descendants.length} subtask(s) have been marked as deleted`,
    deleted_count: tasksToDelete.length
  });
});

// Restore a deleted task (POST /tasks/:id/restore)
router.post('/tasks/:id/restore', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id } = req.body;
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  // Load the task to check ownership and current status
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('task_id, title, owner_id, is_deleted, deleted_by')
    .eq('task_id', taskId)
    .single();
  
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!task.is_deleted) return res.status(400).json({ error: 'Task is not deleted' });

  // Check if acting user can restore (owner or who deleted it)
  if (task.owner_id !== acting_user_id && task.deleted_by !== acting_user_id) {
    return res.status(403).json({ error: 'Only the task owner or the user who deleted it can restore this task' });
  }

  // Restore the task
  const { error: restoreErr, data: restoredTask } = await supabase
    .from('tasks')
    .update({
      is_deleted: false,
      deleted_at: null,
      deleted_by: null
    })
    .eq('task_id', taskId)
    .select()
    .single();

  if (restoreErr) return res.status(500).json({ error: restoreErr.message });


  // Activity: task restored
  try {
    await recordTaskActivity(supabase, {
      taskId,
      authorId: acting_user_id,
      type: ActivityTypes.TASK_RESTORED,
    });
  } catch (_) {}

  // Update project's tasks array if task is linked to a project
  if (restoredTask && restoredTask.project_id) {
    await updateProjectTasksArray(restoredTask.project_id);
  }


  return res.json({ 
    success: true, 
    message: `Task "${task.title}" has been restored`
  });
});


router.patch('/tasks/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const { status } = req.body || {};
  const allowed = new Set(['UNASSIGNED', 'ONGOING', 'UNDER_REVIEW', 'COMPLETED']);

  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });

  // Load acting user
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .maybeSingle();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Load task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Business rule: cannot change status away from UNASSIGNED if there is no assignee
  if (task.assignee_id == null && status !== 'UNASSIGNED') {
    return res.status(400).json({ error: 'Assign someone before changing status' });
  }

  // Owner to compare
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .maybeSingle();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && (acting.access_level > owner.access_level);
  const canEdit = isOwner || isMember || outranksOwner;
  if (!canEdit) return res.status(403).json({ error: 'Forbidden' });

    // Check if this is a recurring task being completed
  if (status === 'COMPLETED' && task.is_recurring) {
    console.log('🔄 Recurring task completed, creating next instance');
    
    // Create the next instance
    const nextInstance = await createNextRecurringInstance(task, actingUserId);
    
    if (nextInstance) {
      console.log('✅ Next recurring instance created:', nextInstance.task_id);
    } else {
      console.log('❌ Failed to create next recurring instance or recurrence ended');
    }
  }

  // --- Two-step update to avoid 406 / “single JSON object” ---
  // 1) Update (no returning rows)
  const { error: updErr } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('task_id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  // 2) Read back exactly one row
  const { data: updated, error: getErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('task_id', id)
    .order('task_id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!updated) return res.status(404).json({ error: 'Task not found after update' });
  // Activity: status change
  try {
    if (task.status !== status) {
      await recordTaskActivity(supabase, {
        taskId: id,
        authorId: actingUserId,
        type: ActivityTypes.STATUS_CHANGED,
        metadata: { from_status: task.status, to_status: status },
      });
      // Email: notify involved users of status change
      try { await notifyTaskStatusChange(supabase, updated, task.status, status, actingUserId); } catch (_) {}
    }
  } catch (_) {}

  return res.json({ data: updated });
});

// NEW: general edit endpoint for multiple fields
router.patch('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  // NEW: accept only whitelisted fields
  const body = req.body || {};
  const allowedStatus = new Set(['UNASSIGNED', 'ONGOING', 'UNDER_REVIEW', 'COMPLETED']);
  // priority_bucket is numeric 1..10 now

  const patch = {};
  if (typeof body.title === 'string') patch.title = body.title.trim();
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.project === 'string') patch.project = body.project.trim();
  if (body.status && allowedStatus.has(body.status)) patch.status = body.status;
  if (Object.prototype.hasOwnProperty.call(body, 'priority_bucket')) {
    if (!(Number.isInteger(body.priority_bucket) && body.priority_bucket >= 1 && body.priority_bucket <= 10)) {
      return res.status(400).json({ error: 'priority_bucket must be an integer between 1 and 10' });
    }
    patch.priority_bucket = body.priority_bucket;
  }
  if (body.due_date) patch.due_date = body.due_date; // ISO date string
  if (body.parent_task_id === null || Number.isInteger(body.parent_task_id)) patch.parent_task_id = body.parent_task_id;
  if (Array.isArray(body.members_id)) patch.members_id = body.members_id.filter((n) => Number.isInteger(n));
  if (Number.isInteger(body.owner_id)) patch.owner_id = body.owner_id;
  if (body.assignee_id === null || Number.isInteger(body.assignee_id)) patch.assignee_id = body.assignee_id;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }
  patch.updated_at = new Date().toISOString();

  // NEW: reuse the same access checks as status update
  const { data: acting, error: actingErr } = await supabase
    .from('users').select('user_id, access_level').eq('user_id', actingUserId).maybeSingle();
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  const { data: task, error: taskErr } = await supabase
    .from('tasks').select('*').eq('task_id', id).eq('is_deleted', false).maybeSingle();
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { data: owner, error: ownerErr } = await supabase
    .from('users').select('user_id, access_level').eq('user_id', task.owner_id).maybeSingle();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && acting.access_level > owner.access_level;
  const canEdit = isOwner || isMember || outranksOwner;
  if (!canEdit) return res.status(403).json({ error: 'Forbidden' });
  // Enforce: only the owner can change priority_bucket
  if (Object.prototype.hasOwnProperty.call(patch, 'priority_bucket') && !isOwner) {
    return res.status(403).json({ error: 'Only the task owner can change the priority' });
  }

  // Derive next values to validate business rules
  const nextAssignee = Object.prototype.hasOwnProperty.call(patch, 'assignee_id') ? patch.assignee_id : task.assignee_id;
  const hasStatusPatch = Object.prototype.hasOwnProperty.call(patch, 'status');
  const nextStatus = hasStatusPatch ? patch.status : task.status;

  // Rule: if no assignee, status must be UNASSIGNED
  if (nextAssignee == null && hasStatusPatch && patch.status !== 'UNASSIGNED') {
    return res.status(400).json({ error: 'Assign someone before changing status' });
  }

  // Rule: if adding an assignee and status not explicitly set or set UNASSIGNED, auto-set to ONGOING
  if (nextAssignee != null && (!hasStatusPatch || patch.status === 'UNASSIGNED')) {
    patch.status = 'ONGOING';
  }
  if (patch.owner_id != null && patch.owner_id !== task.owner_id) {
    const { data: newOwner, error: newOwnerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', patch.owner_id)
      .maybeSingle();
    if (newOwnerErr) return res.status(500).json({ error: newOwnerErr.message });
    if (!newOwner) return res.status(400).json({ error: 'New owner not found' });

    // Policy: acting user can assign to self OR to users they outrank
    const canAssign =
      acting.user_id === newOwner.user_id ||
      (typeof acting.access_level === 'number' &&
      typeof newOwner.access_level === 'number' &&
      acting.access_level > newOwner.access_level);

    if (!canAssign) {
      return res.status(403).json({ error: 'Forbidden: cannot assign owner with equal/higher access' });
    }
  }
  // NEW: two-step update (no returning rows) + read back one
  const { error: updErr } = await supabase.from('tasks').update(patch).eq('task_id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  const { data: updated, error: getErr } = await supabase
    .from('tasks').select('*').eq('task_id', id).order('task_id', { ascending: true }).limit(1).maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!updated) return res.status(404).json({ error: 'Task not found after update' });
  // Activity: field-level edits and assignment
  try {
    const activities = [];
    const changed = (field) => Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== task[field];
    if (changed('assignee_id')) {
      activities.push({
        taskId: id,
        authorId: actingUserId,
        type: ActivityTypes.REASSIGNED,
        metadata: { from_assignee: task.assignee_id, to_assignee: updated.assignee_id },
      });
      // Email: notify unassigned old assignee and new assignee
      try {
        if (task.assignee_id && (!updated.assignee_id || updated.assignee_id !== task.assignee_id)) {
          await notifyTaskUnassigned(supabase, updated, task.assignee_id);
        }
        if (updated.assignee_id && updated.assignee_id !== task.assignee_id) {
          await notifyTaskAssigned(supabase, updated, updated.assignee_id);
        }
      } catch (_) {}
    }
    if (changed('status')) {
      activities.push({
        taskId: id,
        authorId: actingUserId,
        type: ActivityTypes.STATUS_CHANGED,
        metadata: { from_status: task.status, to_status: updated.status },
      });
      // Email: notify involved users of status change
      try { await notifyTaskStatusChange(supabase, updated, task.status, updated.status, actingUserId); } catch (_) {}
    }
    const FIELD_KEYS = ['title','description','project','priority_bucket','due_date','owner_id','members_id','parent_task_id'];
    for (const key of FIELD_KEYS) {
      if (key === 'priority_bucket' && !Object.prototype.hasOwnProperty.call(patch, key)) continue;
      if (changed(key)) {
        activities.push({
          taskId: id,
          authorId: actingUserId,
          type: ActivityTypes.FIELD_EDITED,
          metadata: { field: key, from: task[key], to: updated[key] },
        });
      }
    }
    if (activities.length) {
      await recordMultipleTaskActivities(supabase, activities);
    }
  } catch (_) {}

  return res.json({ data: updated });
});


// NEW: Add existing task to project
router.post('/projects/:id/add-task', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { task_id, acting_user_id } = req.body || {};

  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (!task_id || !acting_user_id) return res.status(400).json({ error: 'task_id and acting_user_id are required' });

  try {
    // Verify user has access to this project
    const actingUserId = parseInt(acting_user_id, 10);
    
    // Load acting user to check access level
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', actingUserId)
      .single();
    
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

    // Load project to check permissions
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('project_id', projectId)
      .single();
    
    if (projectErr) return res.status(500).json({ error: projectErr.message });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check permissions (same as project view)
    const { data: owner, error: ownerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', project.owner_id)
      .single();
    
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });

    const isOwner = project.owner_id === actingUserId;
    const outranksOwner = owner && (acting.access_level > owner.access_level);
    const canAddTask = isOwner || outranksOwner;

    if (!canAddTask) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to add tasks to this project' });
    }

    // Load task to verify it exists and user can modify it
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', task_id)
      .eq('is_deleted', false)
      .single();
    
    if (taskErr) return res.status(500).json({ error: taskErr.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Check if user can modify this task
    const { data: taskOwner, error: taskOwnerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', task.owner_id)
      .single();
    
    if (taskOwnerErr) return res.status(500).json({ error: taskOwnerErr.message });

    const isTaskOwner = task.owner_id === actingUserId;
    const outranksTaskOwner = taskOwner && (acting.access_level > taskOwner.access_level);
    const canModifyTask = isTaskOwner || outranksTaskOwner;

    if (!canModifyTask) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to modify this task' });
    }

    const { error: updateErr, data: updatedTask } = await supabase
      .from('tasks')
      .update({ 
        project_id: projectId,
        project: project.name,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', task_id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    const { error: projectUpdateErr } = await supabase
      .from('projects')
      .update({
        tasks: [...(project.tasks || []), task_id],
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (projectUpdateErr) {
      console.error('❌ Failed to update project tasks array:', projectUpdateErr);
    }

    // NEW: Auto-update project members when task is added
    await updateProjectMembersFromTasks(projectId);

    return res.json({
      success: true,
      message: `Task "${task.title}" added to project "${project.name}"`,
      data: updatedTask
    });
  } catch (error) {
    console.log('❌ Add task to project - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the remove-task endpoint to auto-update members
router.post('/projects/:id/remove-task', async (req, res) => {
  // ...existing code until the project update...
  const projectId = parseInt(req.params.id, 10);
  const { task_id, acting_user_id } = req.body || {};

  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (!task_id || !acting_user_id) return res.status(400).json({ error: 'task_id and acting_user_id are required' });

  try {
    const actingUserId = parseInt(acting_user_id, 10);
    
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', actingUserId)
      .single();
    
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', task_id)
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .single();
    
    if (taskErr) return res.status(500).json({ error: taskErr.message });
    if (!task) return res.status(404).json({ error: 'Task not found in this project' });

    const { data: taskOwner, error: taskOwnerErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', task.owner_id)
      .single();
    
    if (taskOwnerErr) return res.status(500).json({ error: taskOwnerErr.message });

    const isTaskOwner = task.owner_id === actingUserId;
    const outranksTaskOwner = taskOwner && (acting.access_level > taskOwner.access_level);
    const canModifyTask = isTaskOwner || outranksTaskOwner;

    if (!canModifyTask) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions to modify this task' });
    }

    const { error: updateErr, data: updatedTask } = await supabase
      .from('tasks')
      .update({ 
        project_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', task_id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    const { data: currentProject, error: fetchErr } = await supabase
      .from('projects')
      .select('tasks')
      .eq('project_id', projectId)
      .single();

    if (!fetchErr && currentProject) {
      const updatedTasks = (currentProject.tasks || []).filter(id => id !== task_id);
      const { error: projectUpdateErr } = await supabase
        .from('projects')
        .update({
          tasks: updatedTasks,
          updated_at: new Date().toISOString()
        })
        .eq('project_id', projectId);

      if (projectUpdateErr) {
        console.error('❌ Failed to update project tasks array:', projectUpdateErr);
      }
    }

    // NEW: Auto-update project members when task is removed
    await updateProjectMembersFromTasks(projectId);

    return res.json({
      success: true,
      message: `Task "${task.title}" removed from project`,
      data: updatedTask
    });
  } catch (error) {
    console.log('❌ Remove task from project - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to update project members from tasks - ENHANCED
async function updateProjectMembersFromTasks(projectId) {
  try {
    // Get current project with manual members AND owner
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('members, owner_id')
      .eq('project_id', projectId)
      .single();
    
    if (projectErr) {
      console.error('❌ Failed to get project for member update:', projectErr);
      return;
    }

    // Get all tasks in this project to find task-derived members
    const { data: projectTasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('owner_id, assignee_id, members_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false);
    
    if (tasksErr) {
      console.error('❌ Failed to get project tasks for member update:', tasksErr);
      return;
    }

    // Calculate task-derived members
    const taskMembers = new Set();
    (projectTasks || []).forEach(task => {
      if (task.owner_id) taskMembers.add(task.owner_id);
      if (task.assignee_id) taskMembers.add(task.assignee_id);
      if (Array.isArray(task.members_id)) {
        task.members_id.forEach(id => taskMembers.add(id));
      }
    });

    // CRITICAL: Always include project owner and combine with existing members and task members
    const existingMembers = Array.isArray(project.members) ? project.members : [];
    const allMembers = [...new Set([
      project.owner_id, // Always include owner first
      ...existingMembers, 
      ...Array.from(taskMembers)
    ])].filter(id => id !== null && id !== undefined); // Remove any null/undefined values

    console.log('🔄 Updating project members:', {
      projectId,
      owner: project.owner_id,
      existingMembers,
      taskMembers: Array.from(taskMembers),
      finalMembers: allMembers,
      totalCount: allMembers.length
    });

    // Update the project's members array
    const { error: updateErr } = await supabase
      .from('projects')
      .update({ 
        members: allMembers,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateErr) {
      console.error('❌ Failed to update project members:', updateErr);
    } else {
      console.log('✅ Updated project members:', { projectId, totalMembers: allMembers.length });
    }
  } catch (error) {
    console.error('❌ Error in updateProjectMembersFromTasks:', error);
  }
}

// NEW: Add member to project manually (POST /projects/:id/members) - DEBUGGED
router.post('/projects/:id/members', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { user_id, acting_user_id } = req.body || {};

  console.log('🔥 Add member request:', { projectId, user_id, acting_user_id, body: req.body });

  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (!user_id || !acting_user_id) return res.status(400).json({ error: 'user_id and acting_user_id are required' });

  try {
    // Get project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('project_id, owner_id, members')
      .eq('project_id', projectId)
      .single();
    
    console.log('📊 Project data:', { project, error: projectErr });
    
    if (projectErr) return res.status(500).json({ error: projectErr.message });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Use parseInt to ensure proper comparison
    const actingUserIdInt = parseInt(acting_user_id, 10);
    const userIdInt = parseInt(user_id, 10);
    
    console.log('🔍 Permission check:', { 
      projectOwner: project.owner_id, 
      actingUser: actingUserIdInt,
      isOwner: project.owner_id === actingUserIdInt 
    });

    if (project.owner_id !== actingUserIdInt) {
      return res.status(403).json({ error: 'Only project owner can manually add members' });
    }

    // Verify user exists
    const { data: targetUser, error: userErr } = await supabase
      .from('users')
      .select('user_id, full_name')
      .eq('user_id', userIdInt)
      .single();
    
    console.log('👤 Target user:', { targetUser, error: userErr });
    
    if (userErr || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const currentMembers = Array.isArray(project.members) ? project.members : [];
    
    console.log('📋 Current members check:', { 
      currentMembers, 
      userIdInt, 
      isAlreadyMember: currentMembers.includes(userIdInt) 
    });

    if (currentMembers.includes(userIdInt)) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Add to members array ensuring owner is always included
    const updatedMembers = [...new Set([
      project.owner_id, // Always include owner
      ...currentMembers,
      userIdInt // Add new member
    ])].filter(id => id !== null && id !== undefined);
    
    console.log('✅ Updated members array:', { 
      before: currentMembers, 
      after: updatedMembers 
    });

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ 
        members: updatedMembers,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateErr) {
      console.error('❌ Database update error:', updateErr);
      return res.status(500).json({ error: updateErr.message });
    }

    console.log('🎉 Member added successfully');

    return res.json({ 
      success: true, 
      message: `${targetUser.full_name} added to project`,
      data: { 
        members: updatedMembers,
        added_user: targetUser
      }
    });
  } catch (error) {
    console.error('❌ Add member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Remove member from project (DELETE /projects/:id/members/:userId)
router.delete('/projects/:id/members/:userId', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  const { acting_user_id } = req.body || {};

  if (Number.isNaN(projectId) || Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid project or user id' });
  }
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  try {
    // Get project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('project_id, owner_id, members')
      .eq('project_id', projectId)
      .single();
    
    if (projectErr) return res.status(500).json({ error: projectErr.message });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Only project owner can remove members
    if (project.owner_id !== acting_user_id) {
      return res.status(403).json({ error: 'Only project owner can remove members' });
    }

    // Cannot remove project owner
    if (userId === project.owner_id) {
      return res.status(400).json({ error: 'Cannot remove project owner from members' });
    }

    // Get user name for better error messages
    const { data: targetUser } = await supabase
      .from('users')
      .select('user_id, full_name')
      .eq('user_id', userId)
      .single();

    const userName = targetUser?.full_name || 'User';

    // Check if user is involved in any project tasks BEFORE attempting removal
    const { data: userTasks } = await supabase
      .from('tasks')
      .select('task_id, title')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .or(`owner_id.eq.${userId},assignee_id.eq.${userId},members_id.cs.{${userId}}`);

    if (userTasks && userTasks.length > 0) {
      return res.status(400).json({ 
        error: `${userName} cannot be removed because they are involved in ${userTasks.length} project task(s). Remove them from tasks first.`,
        task_involvement: true,
        task_count: userTasks.length
      });
    }

    // Remove from members array (only manual removal, not task-derived)
    const currentMembers = Array.isArray(project.members) ? project.members : [];
    const updatedMembers = currentMembers.filter(id => id !== userId);
    
    const { error: updateErr } = await supabase
      .from('projects')
      .update({ 
        members: updatedMembers,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Auto-update to re-add if they're still involved in tasks (shouldn't happen now due to check above)
    await updateProjectMembersFromTasks(projectId);

    return res.json({ 
      success: true, 
      message: `${userName} removed from project` 
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to update project tasks arrays for any projects that had tasks deleted
async function updateProjectTasksArray(projectId) {
  try {
    // Get current project's tasks array
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('tasks')
      .eq('project_id', projectId)
      .single();
    
    if (projectErr) {
      console.error('❌ Failed to get project for tasks array update:', projectErr);
      return;
    }

    // Get all non-deleted tasks for this project
    const { data: activeTasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('task_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false);
    
    if (tasksErr) {
      console.error('❌ Failed to get active tasks for project:', tasksErr);
      return;
    }

    // Update the project's tasks array with only active task IDs
    const activeTaskIds = (activeTasks || []).map(task => task.task_id);
    
    const { error: updateErr } = await supabase
      .from('projects')
      .update({ 
        tasks: activeTaskIds,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateErr) {
      console.error('❌ Failed to update project tasks array:', updateErr);
    } else {
      console.log('✅ Updated project tasks array:', { projectId, taskCount: activeTaskIds.length });
    }
  } catch (error) {
    console.error('❌ Error in updateProjectTasksArray:', error);
  }
}

// Get all recurring tasks for a user
router.get('/tasks/recurring', async (req, res) => {
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  
  if (Number.isNaN(actingUserId)) {
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  try {
    // Get recurring tasks where user is owner or member
    const { data: recurringTasks, error } = await supabase
      .from('tasks')
      .select(`
        task_id,
        title,
        description,
        due_date,
        next_due_date,
        recurrence_type,
        recurrence_interval,
        recurrence_end_date,
        owner_id,
        assignee_id,
        project,
        status,
        parent_recurring_task_id,
        created_at
      `)
      .eq('is_recurring', true)
      .eq('is_deleted', false)
      .or(`owner_id.eq.${actingUserId},members_id.cs.{${actingUserId}}`)
      .order('next_due_date', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Group by original recurring task (parent_recurring_task_id)
    const grouped = {};
    (recurringTasks || []).forEach(task => {
      const parentId = task.parent_recurring_task_id || task.task_id;
      if (!grouped[parentId]) {
        grouped[parentId] = {
          original_task: null,
          instances: []
        };
      }
      
      if (task.parent_recurring_task_id) {
        grouped[parentId].instances.push(task);
      } else {
        grouped[parentId].original_task = task;
      }
    });

    return res.json({ 
      success: true, 
      data: Object.values(grouped).filter(group => group.original_task)
    });
    
  } catch (error) {
    console.error('Error fetching recurring tasks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Stop recurrence for a task
router.post('/tasks/:id/stop-recurrence', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id } = req.body;
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  try {
    // Get the task and verify permissions
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .single();
    
    if (taskErr) return res.status(500).json({ error: taskErr.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.is_recurring) return res.status(400).json({ error: 'Task is not recurring' });

    // Only owner can stop recurrence
    if (task.owner_id !== acting_user_id) {
      return res.status(403).json({ error: 'Only the task owner can stop recurrence' });
    }

    // Stop recurrence
    const { error: updateErr } = await supabase
      .from('tasks')
      .update({
        is_recurring: false,
        recurrence_type: null,
        recurrence_interval: null,
        next_due_date: null,
        recurrence_end_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Log activity
    try {
      await recordTaskActivity(supabase, {
        taskId: taskId,
        authorId: acting_user_id,
        type: ActivityTypes.FIELD_EDITED,
        metadata: { field: 'recurrence', action: 'stopped' },
        summary: 'Recurrence stopped'
      });
    } catch (_) {}

    return res.json({ 
      success: true, 
      message: 'Recurrence stopped for this task' 
    });
    
  } catch (error) {
    console.error('Error stopping recurrence:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reminder settings for a task
router.get('/tasks/:id/reminders', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  try {
    // Check if user has access to this task
    const hasAccess = await checkTaskAccess(taskId, actingUserId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Get reminder settings
    const { data: reminder, error } = await supabase
      .from('task_reminders')
      .select('*')
      .eq('task_id', taskId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Return default settings if none exist
    const settings = reminder || {
      task_id: taskId,
      enabled: false,
      days_before: 3,
      frequency_per_day: 1
    };

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get reminders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Set reminder settings for a task (only task owner can set)
router.put('/tasks/:id/reminders', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id, enabled, days_before, frequency_per_day } = req.body;
  
  console.log('📧 Set reminders request:', { taskId, acting_user_id, enabled, days_before, frequency_per_day });
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });

  // Validate inputs
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false' });
  }
  
  // Allow any of these values for days_before
  if (enabled && ![1, 3, 7].includes(days_before)) {
    return res.status(400).json({ error: 'days_before must be 1, 3, or 7' });
  }
  
  // Allow any of these values for frequency_per_day
  if (enabled && ![1, 2, 3].includes(frequency_per_day)) {
    return res.status(400).json({ error: 'frequency_per_day must be 1, 2, or 3' });
  }

  try {
    // Get task and verify ownership
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('task_id, owner_id, title, due_date, assignee_id')
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .single();
    
    if (taskErr) return res.status(500).json({ error: taskErr.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Check if task has a due date (required for reminders)
    if (enabled && !task.due_date) {
      return res.status(400).json({ error: 'Cannot enable reminders for a task without a due date' });
    }

    // Only task owner can set reminders
    if (task.owner_id !== acting_user_id) {
      return res.status(403).json({ error: 'Only the task owner can set reminders' });
    }

    // Upsert reminder settings
    const { data: reminder, error: reminderErr } = await supabase
      .from('task_reminders')
      .upsert({
        task_id: taskId,
        enabled,
        days_before: enabled ? days_before : 3, // Default to 3 if disabled
        frequency_per_day: enabled ? frequency_per_day : 1, // Default to 1 if disabled
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'task_id'
      })
      .select()
      .single();

    if (reminderErr) {
      console.error('❌ Reminder upsert error:', reminderErr);
      return res.status(500).json({ error: reminderErr.message });
    }

    console.log('✅ Reminders updated:', reminder);

    // Log activity
    try {
      await recordTaskActivity(supabase, {
        taskId: taskId,
        authorId: acting_user_id,
        type: ActivityTypes.FIELD_EDITED,
        metadata: { 
          field: 'reminders', 
          enabled, 
          days_before, 
          frequency_per_day 
        },
        summary: `Reminders ${enabled ? 'enabled' : 'disabled'}${enabled ? ` (${days_before} days, ${frequency_per_day}x/day)` : ''}`
      });
    } catch (_) {}

    return res.json({ 
      success: true, 
      message: `Reminders ${enabled ? 'enabled' : 'disabled'} for "${task.title}"${enabled ? ` - You'll receive ${frequency_per_day} reminder${frequency_per_day > 1 ? 's' : ''} per day starting ${days_before} days before the due date` : ''}`,
      data: reminder 
    });
  } catch (error) {
    console.error('Set reminders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual trigger for testing reminders (development only) - UPDATED
router.post('/reminders/check', async (req, res) => {
  try {
    console.log('🔔 Manual reminder check triggered');
    const results = await checkAndSendReminders();
    
    return res.json({ 
      success: true, 
      message: `Processed reminder check - sent ${results.length} notifications`,
      notifications_sent: results
    });
  } catch (error) {
    console.error('Check reminders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual trigger for overdue notifications (development/testing)
router.post('/overdue/check', async (req, res) => {
  try {
    console.log('🚨 Manual overdue check triggered');
    const results = await checkAndSendOverdue();
    return res.json({
      success: true,
      message: `Processed overdue check - sent ${results.length} notifications`,
      notifications_sent: results
    });
  } catch (error) {
    console.error('Check overdue error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get notifications for a user
router.get('/notifications', async (req, res) => {
  const userId = parseInt(req.query.user_id, 10);
  if (Number.isNaN(userId)) return res.status(400).json({ error: 'user_id required' });

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Mark notification as read
router.post('/notifications/:id/read', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { user_id } = req.body;
  
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid notification id' });

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', user_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
