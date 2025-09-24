const { Router } = require('express');
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const router = Router();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

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

module.exports = router;


