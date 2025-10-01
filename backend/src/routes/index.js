const { Router } = require('express');
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const router = Router();

const supabase = createClient(
  env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
);



router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, email, full_name, role, access_level, created_at')
    .order('user_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
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
    return res.json({ data: Array.from(map.values()) });
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
    return res.json({ data: Array.from(map.values()) });
  }

  // Default: return all non-deleted tasks
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_deleted', false)
    .order('task_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Create a new task (POST /tasks)
router.post('/tasks', async (req, res) => {
  const { 
    title, 
    description, 
    status = 'TO_DO', 
    priority = 'MEDIUM', 
    due_date, 
    project, 
    owner_id, 
    members_id = [], 
    parent_task_id = null,
    acting_user_id 
  } = req.body;

  if (!title || !owner_id || !acting_user_id) {
    return res.status(400).json({ 
      error: 'Missing required fields: title, owner_id, and acting_user_id are required' 
    });
  }

  // TODO: Implement task creation logic here
  // For now, just return a success response
  return res.json({ success: true, message: 'Task created (placeholder)' });
});
// Create a subtask (POST /tasks/:id/subtask)
router.post('/tasks/:id/subtask', async (req, res) => {
  const parentTaskId = parseInt(req.params.id, 10);
  const { 
    title, 
    description, 
    status = 'TO_DO', 
    priority = 'MEDIUM', 
    due_date, 
    project, 
    owner_id, 
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

  // Validate status and priority
  const validStatuses = ['TO_DO', 'IN_PROGRESS', 'DONE'];
  const validPriorities = ['HIGH', 'MEDIUM', 'LOW'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be TO_DO, IN_PROGRESS, or DONE' });
  }
  
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority. Must be HIGH, MEDIUM, or LOW' });
  }

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
    .select('task_id, title, owner_id, project')
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

  // Inherit project from parent task if not specified
  const taskProject = project || parentTask.project;

  // Create the subtask
  const { data: newSubtask, error: createErr } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      status,
      priority,
      due_date,
      project: taskProject,
      owner_id,
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

  return res.json({ data: task });
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




// Update task priority (PUT /tasks/:id/priority) - Manager/Director only
router.put('/tasks/:id/priority', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { acting_user_id, priority } = req.body;
  
  if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  if (!acting_user_id) return res.status(400).json({ error: 'acting_user_id is required' });
  if (!priority) return res.status(400).json({ error: 'priority is required' });

  // Validate priority value
  const validPriorities = ['HIGH', 'MEDIUM', 'LOW'];
  if (!validPriorities.includes(priority.toUpperCase())) {
    return res.status(400).json({ error: 'Priority must be one of: HIGH, MEDIUM, LOW' });
  }

  // Load acting user to check permissions
  const { data: actingUser, error: actingErr } = await supabase
    .from('users')
    .select('user_id, access_level, role')
    .eq('user_id', acting_user_id)
    .single();
  
  if (actingErr) return res.status(500).json({ error: actingErr.message });
  if (!actingUser) return res.status(400).json({ error: 'Invalid acting_user_id' });

  // Check if user has manager/director permissions (access_level > 0)
  if (actingUser.access_level <= 0) {
    return res.status(403).json({ error: 'Only managers and directors can change task priority' });
  }

  // Load the task to check if it exists and get current details
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('task_id, title, owner_id, priority, is_deleted')
    .eq('task_id', taskId)
    .single();
  
  if (taskErr) return res.status(500).json({ error: taskErr.message });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.is_deleted) return res.status(400).json({ error: 'Cannot modify deleted task' });

  // Load task owner to check if manager has authority over this task
  const { data: taskOwner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .single();
  
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });
  if (!taskOwner) return res.status(400).json({ error: 'Task owner not found' });

  // Manager can only change priority for tasks owned by users with lower or equal access level
  if (actingUser.access_level <= taskOwner.access_level && actingUser.user_id !== task.owner_id) {
    return res.status(403).json({ error: 'You can only change priority for tasks owned by team members with lower access level' });
  }

  // Update the task priority
  const { error: updateErr, data: updatedTask } = await supabase
    .from('tasks')
    .update({
      priority: priority.toUpperCase(),
      updated_at: new Date().toISOString()
    })
    .eq('task_id', taskId)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.json({ 
    success: true, 
    message: `Task "${task.title}" priority updated to ${priority.toUpperCase()}`,
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

  console.log('🔥 DELETE ERROR:', deleteErr); // ADD THIS

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  console.log('🔥 DELETE SUCCESS - Updated tasks:', tasksToDelete.length); // ADD THIS

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
  const { error: restoreErr } = await supabase
    .from('tasks')
    .update({
      is_deleted: false,
      deleted_at: null,
      deleted_by: null
    })
    .eq('task_id', taskId);

  if (restoreErr) return res.status(500).json({ error: restoreErr.message });

  return res.json({ 
    success: true, 
    message: `Task "${task.title}" has been restored`
  });
});


router.patch('/tasks/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  const { status } = req.body || {};
  const allowed = new Set(['TO_DO', 'IN_PROGRESS', 'DONE']);

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

  // Owner to compare
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('user_id, access_level')
    .eq('user_id', task.owner_id)
    .maybeSingle();
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  const isOwner = task.owner_id === actingUserId;
  const isMember = Array.isArray(task.members_id) && task.members_id.includes(actingUserId);
  const outranksOwner = owner && acting.access_level > owner.access_level;
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

  return res.json({ data: updated });
});

// ...existing code...

// NEW: general edit endpoint for multiple fields
router.patch('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actingUserId = req.query.acting_user_id ? parseInt(req.query.acting_user_id, 10) : NaN;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });
  if (Number.isNaN(actingUserId)) return res.status(400).json({ error: 'acting_user_id is required' });

  // NEW: accept only whitelisted fields
  const body = req.body || {};
  const allowedStatus = new Set(['TO_DO', 'IN_PROGRESS', 'DONE']);
  const allowedPriority = new Set(['LOW', 'MEDIUM', 'HIGH']);

  const patch = {};
  if (typeof body.title === 'string') patch.title = body.title.trim();
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.project === 'string') patch.project = body.project.trim();
  if (body.status && allowedStatus.has(body.status)) patch.status = body.status;
  if (body.priority && allowedPriority.has(body.priority)) patch.priority = body.priority;
  if (body.due_date) patch.due_date = body.due_date; // ISO date string
  if (body.parent_task_id === null || Number.isInteger(body.parent_task_id)) patch.parent_task_id = body.parent_task_id;
  if (Array.isArray(body.members_id)) patch.members_id = body.members_id.filter((n) => Number.isInteger(n));
  if (Number.isInteger(body.owner_id)) patch.owner_id = body.owner_id;

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

  return res.json({ data: updated });
});




// ...existing code...
// ...existing code...

module.exports = router;


