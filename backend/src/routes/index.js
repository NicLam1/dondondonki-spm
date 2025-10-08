const { Router } = require('express');
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const { ActivityTypes } = require('../models/activityLog');
const { recordTaskActivity, recordMultipleTaskActivities } = require('../services/activityLog');

const router = Router();

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);


// Normalize any legacy statuses to the canonical set
function mapLegacyStatus(status) {
  if (status === 'TO_DO' || status === 'IN_PROGRESS') return 'ONGOING';
  if (status === 'DONE') return 'COMPLETED';
  return status;
}



router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, email, full_name, role, access_level, created_at')
    .order('user_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Get all projects with access control
router.get('/projects', async (req, res) => {
  console.log('🔥 /projects route HIT!');
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;

  console.log('📊 Projects request - actingUserId:', actingUserId);

  if (Number.isNaN(actingUserId)) {
    console.log('❌ Projects - Invalid acting_user_id');
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  try {
    // Load acting user to check access level
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
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

    // Get all projects
    const { data: allProjects, error: projectsErr } = await supabase
      .from('projects')
      .select('*')
      .order('project_id');
    
    if (projectsErr) {
      console.log('❌ Projects - Error loading projects:', projectsErr);
      return res.status(500).json({ error: projectsErr.message });
    }

    console.log('📊 Projects - Raw projects data:', allProjects);

    // Filter projects based on access level - same hierarchy logic as tasks
    if (acting.access_level === 0) {
      // Staff: only see projects they own
      const filtered = (allProjects || []).filter(project => project.owner_id === actingUserId);
      console.log('👤 Staff user - filtered projects:', filtered);
      return res.json({ data: filtered });
    } else {
      // Manager/Director: see own projects and projects from users with lower access levels
      const { data: allUsers, error: usersErr } = await supabase
        .from('users')
        .select('user_id, access_level');
      if (usersErr) {
        console.log('❌ Projects - Error loading users:', usersErr);
        return res.status(500).json({ error: usersErr.message });
      }

      const allowedOwnerIds = new Set([
        actingUserId,
        ...allUsers.filter(u => u.access_level < acting.access_level).map(u => u.user_id)
      ]);

      const filtered = (allProjects || []).filter(project => allowedOwnerIds.has(project.owner_id));
      console.log('👑 Manager/Director user - filtered projects:', filtered);
      return res.json({ data: filtered });
    }
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

// Create a new project (POST /projects)
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

  // If acting user provided, enforce access rules: can view self and any user with lower access_level
  if (!Number.isNaN(actingUserId)) {
    const { data: actingData, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', actingUserId)
      .single();
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!actingData) return res.status(400).json({ error: 'Invalid acting_user_id' });

    const { data: allUsers, error: usersErr } = await supabase
      .from('users')
      .select('user_id, access_level');
    if (usersErr) return res.status(500).json({ error: usersErr.message });

    const allowedTargetIds = new Set([
      actingUserId,
      ...allUsers.filter((u) => u.access_level < actingData.access_level).map((u) => u.user_id),
    ]);
    const candidateTargets = hasUserIdsParam ? requestedUserIds : [actingUserId];
    const effectiveTargets = candidateTargets.filter((id) => allowedTargetIds.has(id));

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

    // Merge, de-dupe by task_id
    const map = new Map();
    [...ownerTasks, ...memberTasks].forEach((t) => map.set(t.task_id, t));
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
    acting_user_id 
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
    }
  } catch (_) {}

  return res.json({ 
    success: true, 
    message: `Subtask "${title}" created successfully under "${parentTask.title}"`,
    data: newSubtask
  });
});

// Get deleted tasks (Trash view)
router.get('/tasks/deleted', async (req, res) => {
  console.log('🔥 /tasks/deleted route HIT!'); // ADD THIS AS THE VERY FIRST LINE
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const project = req.query.project;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  console.log('🗑️ DELETED TASKS - Raw query:', req.query); // ADD THIS LINE
  console.log('🗑️ DELETED TASKS - Parsed actingUserId:', actingUserId); // ADD THIS LINE

  if (Number.isNaN(actingUserId)) {
    console.log('🗑️ DELETED TASKS - Returning 400: acting_user_id is NaN'); // ADD THIS LINE
    return res.status(400).json({ error: 'acting_user_id is required' });
  }

  // Load acting user to check access level
  const { data: acting, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', actingUserId)
    .single();
  
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Build query for deleted tasks
  let query = supabase
    .from('tasks')
    .select('task_id, title, description, status, priority, due_date, project, owner_id, members_id, parent_task_id, deleted_at, deleted_by, created_at')
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

  // Filter tasks based on access level - user can see:
  // 1. Tasks they own
  // 2. Tasks owned by users with lower access level (if they're manager/director)
  if (acting.access_level === 0) { // Staff - only see own tasks
    const filtered = deletedTasks.filter(task => task.owner_id === actingUserId);
    return res.json({ data: filtered });
  } else {
    // Manager/Director - see own tasks and tasks from lower access levels
    const { data: allUsers, error: usersErr } = await supabase
      .from('users')
      .select('user_id, access_level');
    if (usersErr) return res.status(500).json({ error: usersErr.message });

    const allowedOwnerIds = new Set([
      actingUserId,
      ...allUsers.filter(u => u.access_level < acting.access_level).map(u => u.user_id)
    ]);

    const filtered = deletedTasks.filter(task => allowedOwnerIds.has(task.owner_id));
    return res.json({ data: filtered });
  }
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
  const outranksOwner = owner && acting.access_level > owner.access_level;
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

  const serialized = (logs || []).map((row) => ({
    id: row.log_id,
    taskId: row.task_id,
    authorId: row.author_id,
    author: row.author_id ? usersById[row.author_id] || null : null,
    type: row.type,
    summary: row.summary,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));

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
    }
    if (changed('status')) {
      activities.push({
        taskId: id,
        authorId: actingUserId,
        type: ActivityTypes.STATUS_CHANGED,
        metadata: { from_status: task.status, to_status: updated.status },
      });
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

    // Simply set the project_id on the task
    const { error: updateErr, data: updatedTask } = await supabase
      .from('tasks')
      .update({ 
        project_id: projectId,
        project: project.name, // Also update the project name field
        updated_at: new Date().toISOString()
      })
      .eq('task_id', task_id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // ADD THIS: Also update the project's tasks array
    const { error: projectUpdateErr } = await supabase
      .from('projects')
      .update({
        tasks: [...(project.tasks || []), task_id],  // Add task_id to array
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (projectUpdateErr) {
      console.error('❌ Failed to update project tasks array:', projectUpdateErr);
      // Don't fail the whole request, just log the error
    }

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

// NEW: Remove task from project
router.post('/projects/:id/remove-task', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { task_id, acting_user_id } = req.body || {};

  if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project id' });
  if (!task_id || !acting_user_id) return res.status(400).json({ error: 'task_id and acting_user_id are required' });

  try {
    // Similar permission checks as add-task...
    const actingUserId = parseInt(acting_user_id, 10);
    
    const { data: acting, error: actingErr } = await supabase
      .from('users')
      .select('user_id, access_level')
      .eq('user_id', actingUserId)
      .single();
    
    if (actingErr) return res.status(500).json({ error: actingErr.message });
    if (!acting) return res.status(400).json({ error: 'Invalid acting_user_id' });

    // Load task to verify it exists
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', task_id)
      .eq('project_id', projectId) // Must be in this project
      .eq('is_deleted', false)
      .single();
    
    if (taskErr) return res.status(500).json({ error: taskErr.message });
    if (!task) return res.status(404).json({ error: 'Task not found in this project' });

    // Check permissions (simplified - just task owner or higher access)
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

    // Remove project association
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

    // ADD THIS: Also update the project's tasks array
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
        // Don't fail the whole request, just log the error
      }
    }

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

module.exports = router;