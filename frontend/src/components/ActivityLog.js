import React from 'react';
import { Box, Stack, Typography, Avatar, Chip, CircularProgress, TextField, Button } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

async function fetchActivity(taskId, actingUserId, { limit = 100, offset = 0 } = {}) {
  const url = new URL(`${API_BASE}/tasks/${taskId}/activity`);
  url.searchParams.set('acting_user_id', String(actingUserId));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url.toString(), { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Failed to load activity`);
  return json?.data || [];
}

export default function ActivityLog({ taskId, actingUserId }) {
  const queryClient = useQueryClient();
  const { data: activity, isLoading, isError } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: () => fetchActivity(taskId, actingUserId),
    enabled: Boolean(taskId && actingUserId),
    staleTime: 10_000,
  });
  const [comment, setComment] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submitComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: actingUserId, comment: text })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to add comment');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] });
    } catch (_) {
      // noop UI error; could add snackbar via parent
    } finally {
      setSubmitting(false);
    }
  };

  if (!taskId) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="overline" sx={{ letterSpacing: 0.6 }}>
        Activity
      </Typography>
      {isLoading ? (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">Loading…</Typography>
        </Stack>
      ) : isError ? (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          Unable to load activity.
        </Typography>
      ) : (Array.isArray(activity) && activity.length > 0 ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {activity.map((log) => (
            <Stack key={log.id} direction="row" spacing={1.5} alignItems="flex-start">
              <Avatar sx={{ width: 28, height: 28 }}>
                {(log.author?.full_name || '?').slice(0,1).toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {log.author?.full_name || 'Unknown'}
                  </Typography>
                  <Chip size="small" variant="outlined" label={formatTypeLabel(log.type)} />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(log.createdAt).toLocaleString()}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {log.summary}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No activity yet.
        </Typography>
      ))}
      {Boolean(taskId && actingUserId) && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Add a comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
            }}
          />
          <Button variant="contained" disabled={submitting || !comment.trim()} onClick={submitComment}>
            Send
          </Button>
        </Stack>
      )}
    </Box>
  );
}

function formatTypeLabel(type) {
  switch (type) {
    case 'status_changed': return 'Status';
    case 'field_edited': return 'Edit';
    case 'comment_added': return 'Comment';
    case 'reassigned': return 'Assignment';
    case 'task_created': return 'Created';
    case 'task_deleted': return 'Deleted';
    case 'task_restored': return 'Restored';
    default: return 'Activity';
  }
}


