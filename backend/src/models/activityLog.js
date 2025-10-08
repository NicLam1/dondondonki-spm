'use strict';

// Canonical activity types for task activity logs
const ActivityTypes = Object.freeze({
  STATUS_CHANGED: 'status_changed',
  FIELD_EDITED: 'field_edited',
  COMMENT_ADDED: 'comment_added',
  REASSIGNED: 'reassigned',
  TASK_CREATED: 'task_created',
  TASK_DELETED: 'task_deleted',
  TASK_RESTORED: 'task_restored',
});

const VALID_TYPES = new Set(Object.values(ActivityTypes));

function isValidActivityType(type) {
  return typeof type === 'string' && VALID_TYPES.has(type);
}

function formatActivitySummary(type, metadata = {}) {
  if (!isValidActivityType(type)) return 'Activity';
  switch (type) {
    case ActivityTypes.STATUS_CHANGED: {
      const from = metadata.from_status || metadata.from || 'unknown';
      const to = metadata.to_status || metadata.to || 'unknown';
      return `Status changed: ${from} → ${to}`;
    }
    case ActivityTypes.FIELD_EDITED: {
      const field = metadata.field || 'field';
      const from = metadata.from == null ? '—' : String(metadata.from);
      const to = metadata.to == null ? '—' : String(metadata.to);
      return `Edited ${field}: ${from} → ${to}`;
    }
    case ActivityTypes.COMMENT_ADDED: {
      const preview = (metadata.comment_preview || '').toString().trim();
      return preview ? `Comment: ${preview}` : 'Comment added';
    }
    case ActivityTypes.REASSIGNED: {
      const from = metadata.from_assignee || metadata.from || null;
      const to = metadata.to_assignee || metadata.to || null;
      const fromStr = from == null ? 'Unassigned' : String(from);
      const toStr = to == null ? 'Unassigned' : String(to);
      return `Reassigned: ${fromStr} → ${toStr}`;
    }
    case ActivityTypes.TASK_CREATED:
      return 'Task created';
    case ActivityTypes.TASK_DELETED:
      return 'Task deleted';
    case ActivityTypes.TASK_RESTORED:
      return 'Task restored';
    default:
      return 'Activity';
  }
}

/**
 * Convert a raw DB row to API-facing shape. Optionally enrich with usersById map.
 * @param {Object} row Raw row from task_activity_logs
 * @param {Object<number, any>} [usersById] Optional user enrichment map keyed by user_id
 */
function serializeActivityLog(row, usersById) {
  if (!row || typeof row !== 'object') return null;
  const sanitizedMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const author = usersById && row.author_id ? usersById[row.author_id] || null : null;
  return {
    id: row.log_id,
    taskId: row.task_id,
    authorId: row.author_id ?? null,
    author, // optional enriched user object
    type: row.type,
    summary: (typeof row.summary === 'string' && row.summary.trim())
      ? row.summary.trim()
      : formatActivitySummary(row.type, sanitizedMetadata),
    metadata: sanitizedMetadata,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function serializeActivityLogs(rows, usersById) {
  return Array.isArray(rows) ? rows.map((r) => serializeActivityLog(r, usersById)).filter(Boolean) : [];
}

module.exports = {
  ActivityTypes,
  isValidActivityType,
  formatActivitySummary,
  serializeActivityLog,
  serializeActivityLogs,
};


