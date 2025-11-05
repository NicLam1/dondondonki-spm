import React from 'react';
import { Box, Stack, Typography, Avatar, Chip, CircularProgress, TextField, Button, Paper, List, ListItemButton, ListItemText, Popper } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

async function fetchActivity(taskId, actingUserId, { limit = 100, offset = 0 } = {}) {
  const url = new URL(`${API_BASE}/tasks/${taskId}/activity`);
  url.searchParams.set('acting_user_id', String(actingUserId));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url.toString());
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
  const [allUsers, setAllUsers] = React.useState([]);
  const [mentions, setMentions] = React.useState([]); // array of user_ids
  const [mentionActive, setMentionActive] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState('');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      try {
        const res = await fetch(`${API_BASE}/users`);
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(json?.data)) setAllUsers(json.data);
      } catch (_) {}
    }
    loadUsers();
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = React.useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!mentionActive) return [];
    if (!q) return allUsers.slice(0, 8);
    return allUsers.filter((u) => (
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    )).slice(0, 8);
  }, [mentionActive, mentionQuery, allUsers]);

  const usersById = React.useMemo(() => {
    const map = {};
    for (const u of allUsers) map[u.user_id] = u;
    return map;
  }, [allUsers]);

  const allNameMentionCandidates = React.useMemo(() => {
    const set = new Set();
    for (const u of allUsers) {
      const name = (u && u.full_name) ? String(u.full_name).trim() : '';
      if (name) set.add(`@${name}`);
    }
    return Array.from(set).sort((a, b) => b.length - a.length);
  }, [allUsers]);

  const renderLogSummary = React.useCallback((log) => {
    // Default: plain summary
    if (log?.type !== 'comment_added') return log?.summary || '';
    const full = (log?.summary || '').replace(/^Comment:\s*/, '');
    const mentionIds = Array.isArray(log?.metadata?.mentions) ? log.metadata.mentions : [];
    const idCandidates = mentionIds
      .map((id) => {
        const u = usersById[id];
        return u ? `@${u.full_name}` : null;
      })
      .filter(Boolean);
    // Union of ID-backed candidates and all known full names; longest first
    const candidates = Array.from(new Set([...
      idCandidates,
      ...allNameMentionCandidates,
    ])).sort((a, b) => b.length - a.length);

    const nodes = [];
    let i = 0;
    let buf = '';
    while (i < full.length) {
      let matched = null;
      if (full[i] === '@') {
        for (const m of candidates) {
          if (full.startsWith(m, i)) { matched = m; break; }
        }
      }
      if (matched) {
        if (buf) { nodes.push(buf); buf = ''; }
        nodes.push(
          <Chip
            key={`m-${i}`}
            label={matched}
            size="small"
            sx={{
              bgcolor: '#6A11CB',
              color: '#fff',
              height: 22,
              borderRadius: '12px',
              lineHeight: 1,
              mx: 0.25,
              '& .MuiChip-label': { px: 0.75, lineHeight: '20px' }
            }}
          />
        );
        i += matched.length;
      } else {
        // Fallback: highlight @word even if not a known user token
        if (full[i] === '@') {
          const rest = full.slice(i);
          // Capture up to 3 words separated by spaces (handles multi-word names)
          const m = /^@([A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+){0,3})/.exec(rest);
          if (m) {
            if (buf) { nodes.push(buf); buf = ''; }
            nodes.push(
              <Chip
                key={`mx-${i}`}
                label={m[0]}
                size="small"
                sx={{
                  bgcolor: '#6A11CB',
                  color: '#fff',
                  height: 22,
                  borderRadius: '12px',
                  lineHeight: 1,
                  mx: 0.25,
                  '& .MuiChip-label': { px: 0.75, lineHeight: '20px' }
                }}
              />
            );
            i += m[0].length;
            continue;
          }
        }
        buf += full[i];
        i += 1;
      }
    }
    if (buf) nodes.push(buf);
    return nodes;
  }, [usersById]);

  const startMentionAtCursor = () => {
    setMentionActive(true);
    setMentionQuery('');
  };

  const replaceCurrentMentionWith = (user) => {
    const el = inputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? comment.length;
    const uptoCaret = comment.slice(0, caret);
    const lastAt = uptoCaret.lastIndexOf('@');
    if (lastAt === -1) return;
    const before = comment.slice(0, lastAt);
    const after = comment.slice(caret);
    const insertion = `@${user.full_name} `;
    const next = `${before}${insertion}${after}`;
    setComment(next);
    setMentions((prev) => prev.includes(user.user_id) ? prev : [...prev, user.user_id]);
    setMentionActive(false);
    setMentionQuery('');
    // restore caret after insertion
    const nextPos = before.length + insertion.length;
    setTimeout(() => {
      try {
        el.focus();
        el.setSelectionRange(nextPos, nextPos);
      } catch (_) {}
    }, 0);
  };

  const submitComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: actingUserId, comment: text, mentions })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to add comment');
      setComment('');
      setMentions([]);
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
                  {renderLogSummary(log)}
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
            inputRef={(node) => {
              // MUI forwards to input element
              inputRef.current = node;
            }}
            onChange={(e) => {
              const val = e.target.value;
              setComment(val);
              const el = inputRef.current;
              const caret = el ? (el.selectionStart ?? val.length) : val.length;
              const uptoCaret = val.slice(0, caret);
              const lastAt = uptoCaret.lastIndexOf('@');
              if (lastAt >= 0) {
                const afterAt = uptoCaret.slice(lastAt + 1);
                // stop mention mode if whitespace or newline before caret
                if (/\s/.test(afterAt)) {
                  setMentionActive(false);
                  setMentionQuery('');
                } else {
                  if (!mentionActive) startMentionAtCursor();
                  setMentionQuery(afterAt);
                }
              } else {
                setMentionActive(false);
                setMentionQuery('');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (mentionActive && filteredUsers.length) {
                  // select first match
                  e.stopPropagation();
                  replaceCurrentMentionWith(filteredUsers[0]);
                } else {
                  submitComment();
                }
              }
              if (e.key === '@') {
                // begin mention
                setTimeout(() => startMentionAtCursor(), 0);
              }
              if (e.key === 'Escape' && mentionActive) {
                setMentionActive(false);
                setMentionQuery('');
              }
            }}
          />
          <Button variant="contained" disabled={submitting || !comment.trim()} onClick={submitComment}>
            Send
          </Button>
        </Stack>
      )}
      {mentionActive && filteredUsers.length > 0 && (
        <Popper
          open
          anchorEl={inputRef.current}
          placement="top-start"
          modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
          style={{ zIndex: 1500 }}
        >
          <Paper elevation={3} sx={{ width: 360, maxWidth: 'calc(100vw - 32px)' }}>
            <List dense>
              {filteredUsers.map((u) => (
                <ListItemButton key={u.user_id} onClick={() => replaceCurrentMentionWith(u)}>
                  <ListItemText primary={u.full_name} secondary={u.email} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Popper>
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


