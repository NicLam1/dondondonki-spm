'use strict';

const { sendMail } = require('./email');

async function getUsersByIds(supabase, userIds) {
  const uniqueIds = Array.from(new Set((userIds || []).filter((id) => Number.isInteger(id))));
  if (!uniqueIds.length) return {};
  const { data, error } = await supabase
    .from('users')
    .select('user_id, email, full_name')
    .in('user_id', uniqueIds);
  if (error) return {};
  const map = {};
  for (const row of data || []) {
    map[row.user_id] = row;
  }
  return map;
}

async function getEmailOptInSet(supabase, userIds) {
  const uniqueIds = Array.from(new Set((userIds || []).filter((id) => Number.isInteger(id))));
  if (!uniqueIds.length) return new Set();
  const { data, error } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', uniqueIds)
    .eq('email', true);
  if (error) return new Set();
  return new Set((data || []).map((r) => r.user_id));
}

async function notifyTaskAssigned(supabase, task, assigneeId) {
  if (!assigneeId) return;
  const [users, optInSet] = await Promise.all([
    getUsersByIds(supabase, [assigneeId]),
    getEmailOptInSet(supabase, [assigneeId]),
  ]);
  const user = users[assigneeId];
  if (!user || !user.email || !optInSet.has(Number(assigneeId))) return;
  const subject = `[Task Assigned] ${task.title}`;
  const text = `You have been assigned to task "${task.title}". Due: ${task.due_date || 'N/A'}`;
  const html = `<p>You have been assigned to task <strong>${escapeHtml(task.title)}</strong>.</p><p>Due: ${task.due_date || 'N/A'}</p>`;
  await sendMail({ to: user.email, subject, text, html });
}

async function notifyTaskUnassigned(supabase, task, oldAssigneeId) {
  if (!oldAssigneeId) return;
  const [users, optInSet] = await Promise.all([
    getUsersByIds(supabase, [oldAssigneeId]),
    getEmailOptInSet(supabase, [oldAssigneeId]),
  ]);
  const user = users[oldAssigneeId];
  if (!user || !user.email || !optInSet.has(Number(oldAssigneeId))) return;
  const subject = `[Task Unassigned] ${task.title}`;
  const text = `You have been unassigned from task "${task.title}".`;
  const html = `<p>You have been unassigned from task <strong>${escapeHtml(task.title)}</strong>.</p>`;
  await sendMail({ to: user.email, subject, text, html });
}

async function notifyTaskStatusChange(supabase, task, oldStatus, newStatus, actingUserId) {
  if (!task) return;
  const recipientIds = new Set();
  if (Number.isInteger(task.owner_id)) recipientIds.add(task.owner_id);
  if (Number.isInteger(task.assignee_id)) recipientIds.add(task.assignee_id);
  if (Array.isArray(task.members_id)) task.members_id.forEach((id) => Number.isInteger(id) && recipientIds.add(id));
  if (Number.isInteger(actingUserId)) recipientIds.delete(actingUserId);
  if (!recipientIds.size) return;
  const [users, optInSet] = await Promise.all([
    getUsersByIds(supabase, Array.from(recipientIds)),
    getEmailOptInSet(supabase, Array.from(recipientIds)),
  ]);
  const subject = `[Task Status Changed] ${task.title}: ${oldStatus} → ${newStatus}`;
  const text = `Task "${task.title}" status changed from ${oldStatus} to ${newStatus}. Due: ${task.due_date || 'N/A'}`;
  const html = `<p>Task <strong>${escapeHtml(task.title)}</strong> status changed: <strong>${escapeHtml(oldStatus)}</strong> → <strong>${escapeHtml(newStatus)}</strong>.</p><p>Due: ${task.due_date || 'N/A'}</p>`;
  const sends = [];
  for (const id of Object.keys(users)) {
    const user = users[id];
    if (user && user.email && optInSet.has(Number(id))) {
      sends.push(sendMail({ to: user.email, subject, text, html }));
    }
  }
  if (sends.length) await Promise.allSettled(sends);
}

async function notifyCommentMentioned(supabase, task, mentionedUserIds, author) {
  const uniqueIds = Array.from(new Set((mentionedUserIds || []).filter((id) => Number.isInteger(id))));
  if (!uniqueIds.length) return;
  const [users, optInSet] = await Promise.all([
    getUsersByIds(supabase, uniqueIds),
    getEmailOptInSet(supabase, uniqueIds),
  ]);
  const authorName = author?.full_name || 'Someone';
  const subject = `[Mentioned] ${authorName} mentioned you on ${task.title}`;
  const preview = (task.comment_preview || '').toString();
  const text = `${authorName} mentioned you on task "${task.title}". ${preview ? `Comment: ${preview}` : ''}`;
  const html = `<p><strong>${escapeHtml(authorName)}</strong> mentioned you on task <strong>${escapeHtml(task.title)}</strong>.</p>${preview ? `<p>Comment: ${escapeHtml(preview)}</p>` : ''}`;
  const sends = [];
  for (const id of uniqueIds) {
    const user = users[id];
    if (user && user.email && optInSet.has(Number(id))) {
      sends.push(sendMail({ to: user.email, subject, text, html }));
    }
  }
  if (sends.length) await Promise.allSettled(sends);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  notifyTaskAssigned,
  notifyTaskUnassigned,
  notifyTaskStatusChange,
  notifyCommentMentioned,
};


