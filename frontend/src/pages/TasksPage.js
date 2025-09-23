import '../App.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputBase,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import SettingsIcon from '@mui/icons-material/Settings';
import MailIcon from '@mui/icons-material/Mail';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExtensionIcon from '@mui/icons-material/Extension';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

async function fetchJson(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

function StatusChip({ value }) {
  const color = value === 'DONE' ? 'success' : value === 'IN_PROGRESS' ? 'warning' : 'default';
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

function PriorityChip({ value }) {
  const color = value === 'HIGH' ? 'error' : value === 'MEDIUM' ? 'warning' : 'default';
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

function TaskCard({ task, usersById, onOpen }) {
  const owner = usersById.get(task.owner_id);
  const members = (task.members_id || []).map((id) => usersById.get(id)).filter(Boolean);
  return (
    <Card variant="outlined" sx={styles.taskCard}>
      <CardActionArea onClick={onOpen} sx={styles.taskCardAction}>
        <CardContent sx={styles.taskCardContent}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{task.title}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusChip value={task.status} />
              <PriorityChip value={task.priority} />
            </Stack>
          </Stack>
          <Typography variant="caption" sx={styles.cardHint}>
            Click to view details
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function TasksPage() {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [viewUserIds, setViewUserIds] = useState([]);
  const prevActingIdRef = useRef(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const SIDEBAR_WIDTH = 240;
  const SIDEBAR_MINI_WIDTH = 80;

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson('/users'),
  });

  const users = usersData?.data || [];
  const usersById = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);

  useEffect(() => {
    if (users.length && !selectedUserId) {
      setSelectedUserId(String(users[0].user_id));
    }
  }, [users, selectedUserId]);

  const actingUser = useMemo(() => users.find((u) => String(u.user_id) === String(selectedUserId)), [users, selectedUserId]);
  const allowedUsers = useMemo(() => {
    if (!actingUser) return [];
    return users.filter((u) => u.access_level <= actingUser.access_level);
  }, [users, actingUser]);

  useEffect(() => {
    if (!actingUser) return;
    const actingIdStr = String(actingUser.user_id);
    const prev = prevActingIdRef.current;
    const allowedIds = new Set(allowedUsers.map((u) => String(u.user_id)));
    if (prev !== actingIdStr) {
      prevActingIdRef.current = actingIdStr;
      if (allowedIds.has(actingIdStr)) setViewUserIds([actingIdStr]);
      return;
    }
    const pruned = viewUserIds.filter((id) => allowedIds.has(String(id)));
    if (pruned.length !== viewUserIds.length) setViewUserIds(pruned);
  }, [actingUser, allowedUsers]);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', selectedUserId, viewUserIds],
    queryFn: () => fetchJson(
      '/tasks',
      selectedUserId
        ? {
            acting_user_id: selectedUserId,
            user_ids: (actingUser && actingUser.access_level > 0)
              ? ((viewUserIds && viewUserIds.length) ? viewUserIds.join(',') : '')
              : undefined,
          }
        : undefined
    ),
    enabled: Boolean(selectedUserId),
  });

  const tasks = (actingUser && actingUser.access_level > 0 && viewUserIds.length === 0)
    ? []
    : (tasksData?.data || []);
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const tasksByStatus = useMemo(() => {
    const group = { TO_DO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of tasks) {
      if (t.status === 'IN_PROGRESS') group.IN_PROGRESS.push(t);
      else if (t.status === 'DONE') group.DONE.push(t);
      else group.TO_DO.push(t);
    }
    Object.keys(group).forEach((k) => group[k].sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99)));
    return group;
  }, [tasks]);
  const statusLabels = { TO_DO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Completed' };

  const sidebarItems = [
    { key: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard' },
    { key: 'profile', icon: <PersonIcon />, label: 'Profile' },
    { key: 'settings', icon: <SettingsIcon />, label: 'Settings' },
    { key: 'messages', icon: <MailIcon />, label: 'Messages', badge: 12 },
  ];

  return (
    <Box sx={styles.root}>
      <Drawer
        variant="permanent"
        PaperProps={{
          sx: { ...styles.drawerPaper, width: isSidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_MINI_WIDTH },
        }}
        sx={{ ...styles.drawer, width: isSidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_MINI_WIDTH }}
      >
        <Toolbar sx={{ ...styles.drawerToolbar, justifyContent: isSidebarOpen ? 'space-between' : 'center' }}>
          {isSidebarOpen && (
            <Typography variant="subtitle1" noWrap sx={styles.brandTitle}>DonkiBoard</Typography>
          )}
          <IconButton onClick={() => setIsSidebarOpen((v) => !v)} sx={styles.drawerToggleButton}>
            {isSidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
          </IconButton>
        </Toolbar>
        <Divider sx={styles.drawerDivider} />
        <List sx={styles.drawerList}>
          {sidebarItems.map((item) => (
            <ListItemButton
              key={item.key}
              sx={{
                ...styles.drawerItemButton,
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                px: isSidebarOpen ? 2.5 : 1,
              }}
            >
              <ListItemIcon
                sx={{
                  ...styles.drawerItemIcon,
                  minWidth: isSidebarOpen ? 40 : 0,
                  mr: isSidebarOpen ? 2 : 0,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {item.badge ? (
                  <Badge color="secondary" badgeContent={item.badge} overlap="circular">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              {isSidebarOpen && <ListItemText primary={item.label} />}
            </ListItemButton>
          ))}
        </List>
        <Box sx={styles.flexGrow} />
        <Box sx={{ ...styles.drawerFooter, justifyContent: isSidebarOpen ? 'space-between' : 'center' }}>
          {isSidebarOpen && (
            <Box>
              <Typography variant="caption" sx={styles.footerHeading}>History available</Typography>
              <Typography variant="caption" sx={styles.footerText}>Check your weekly</Typography>
              <Typography variant="caption" sx={styles.footerText}>transaction reports</Typography>
            </Box>
          )}
          <Avatar sx={styles.footerAvatar}>H</Avatar>
        </Box>
      </Drawer>

      <Box sx={styles.main}>
        <AppBar position="sticky" elevation={0} color="transparent" sx={styles.appBar}>
          <Toolbar sx={styles.topToolbar}>
            {/* <Tooltip title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <IconButton onClick={() => setIsSidebarOpen((v) => !v)}>
                {isSidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
              </IconButton>
            </Tooltip> */}
            <Paper sx={styles.searchPaper}>
              <InputBase placeholder="Search…" sx={styles.searchInput} />
            </Paper>
            <IconButton>
              <Badge color="primary" variant="dot">
                <MailIcon />
              </Badge>
            </IconButton>
            <Avatar>ML</Avatar>
          </Toolbar>
        </AppBar>

        <Box sx={styles.content}>
          <Container maxWidth={false} disableGutters sx={styles.contentContainer}>
            <Typography variant="h5" sx={styles.headerTitle}>Tasks</Typography>

            <Box sx={styles.filtersRow}>
              <FormControl sx={styles.selectSmall}>
                <InputLabel id="acting-user-label">Acting user</InputLabel>
                <Select
                  labelId="acting-user-label"
                  value={selectedUserId}
                  label="Acting user"
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {users.map((u) => (
                    <MenuItem key={u.user_id} value={String(u.user_id)}>
                      {u.full_name} ({u.role})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {actingUser && actingUser.access_level > 0 && (
                <FormControl sx={styles.selectMedium}>
                  <InputLabel id="view-users-label">View tasks of</InputLabel>
                  <Select
                    multiple
                    labelId="view-users-label"
                    value={viewUserIds}
                    label="View tasks of"
                    onChange={(e) => setViewUserIds(Array.isArray(e.target.value) ? e.target.value : [])}
                    renderValue={(selected) =>
                      {
                        const sel = Array.isArray(selected) ? selected : [];
                        if (!sel.length) return '';
                        const onlyMe = actingUser && sel.length === 1 && String(sel[0]) === String(actingUser.user_id);
                        if (onlyMe) return 'Me';
                        if (sel.length > 1) return `${sel.length} members`;
                        const name = usersById.get(Number(sel[0]))?.full_name;
                        return name || '';
                      }
                    }
                  >
                    {allowedUsers.map((u) => {
                      const idStr = String(u.user_id);
                      const checked = viewUserIds.indexOf(idStr) > -1;
                      const label = actingUser && String(actingUser.user_id) === idStr ? 'Me' : `${u.full_name} (${u.role})`;
                      return (
                        <MenuItem key={u.user_id} value={idStr}>
                          <Checkbox checked={checked} />
                          <ListItemText primary={label} />
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            </Box>

            {isLoading ? (
              <Typography variant="body1">Loading tasks…</Typography>
            ) : (
              <>
                <Box sx={styles.gradientDivider} />
                <Box sx={styles.columnsWrap}>
                {(['TO_DO', 'IN_PROGRESS', 'DONE']).map((status) => (
                  <Box key={status} sx={styles.column}>
                    <Paper elevation={0} sx={styles.columnPaper}>
                      <Typography variant="subtitle1" sx={styles.columnTitle}>{statusLabels[status]}</Typography>
                      {tasksByStatus[status].length === 0 ? (
                        <Box sx={styles.columnEmpty}> 
                          <Typography variant="body2" sx={styles.columnEmptyText}>No tasks</Typography>
                        </Box>
                      ) : (
                        <Stack spacing={2}>
                          {tasksByStatus[status].map((t) => (
                            <TaskCard key={t.task_id} task={t} usersById={usersById} onOpen={() => setSelectedTask(t)} />
                          ))}
                        </Stack>
                      )}
                    </Paper>
                  </Box>
                ))}
                </Box>
              </>
            )}
          </Container>
        </Box>
      </Box>

      <Dialog open={Boolean(selectedTask)} onClose={() => setSelectedTask(null)} fullWidth maxWidth="sm" PaperProps={{ sx: styles.dialogPaper }}>
        {selectedTask && (
          <>
            <DialogTitle>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={styles.dialogTitleRow}>
                <Typography variant="h6" sx={styles.dialogTitle}>{selectedTask.title}</Typography>
                <Stack direction="row" spacing={1}>
                  <StatusChip value={selectedTask.status} />
                  <PriorityChip value={selectedTask.priority} />
                </Stack>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>Overview</Typography>
                <Typography variant="body1" sx={styles.dialogDescription}>{selectedTask.description || 'No description.'}</Typography>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>Details</Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Project</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.project || '—'}</Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Due date</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : '—'}</Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>People</Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Owner</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{usersById.get(selectedTask.owner_id)?.full_name || '—'}</Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Members</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{(selectedTask.members_id || []).map((id) => usersById.get(id)?.full_name).filter(Boolean).join(', ') || '—'}</Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>Meta</Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Task ID</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.task_id}</Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Parent</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.parent_task_id ?? '—'}</Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Deleted</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.is_deleted ? 'Yes' : 'No'}</Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Created</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.created_at ? new Date(selectedTask.created_at).toLocaleString() : '—'}</Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>Updated</Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>{selectedTask.updated_at ? new Date(selectedTask.updated_at).toLocaleString() : '—'}</Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>Attachments</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={styles.dialogAttachments}>
                  {(selectedTask.attachments || []).length === 0 ? (
                    <Typography variant="caption" color="text.secondary">No attachments</Typography>
                  ) : (
                    (selectedTask.attachments || []).map((a, idx) => (
                      <Chip key={idx} label={a.name || 'file.pdf'} size="small" />
                    ))
                  )}
                </Stack>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedTask(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

// styles
const styles = {
  root: { display: 'flex', minHeight: '100vh', bgcolor: '#f6f7fb' },
  drawer: { flexShrink: 0, '& .MuiDrawer-paper': { boxSizing: 'border-box' } },
  drawerPaper: {
    transition: 'width 200ms ease',
    overflowX: 'hidden',
    background: 'linear-gradient(180deg, #6a11cb 0%, #4e54c8 50%, #6a11cb 100%)',
    color: 'white',
    borderRight: 0,
  },
  drawerToolbar: { display: 'flex', alignItems: 'center' },
  brandTitle: { fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 },
  drawerToggleButton: { color: 'white' },
  drawerDivider: { borderColor: 'rgba(255,255,255,0.3)' },
  drawerList: { py: 1 },
  drawerItemButton: { px: 2.5, py: 1.25, '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' } },
  drawerItemIcon: { minWidth: 40, color: 'inherit' },
  flexGrow: { flexGrow: 1 },
  drawerFooter: { p: 2, display: 'flex', alignItems: 'center' },
  footerHeading: { opacity: 0.8 },
  footerText: { opacity: 0.6, display: 'block' },
  footerAvatar: { bgcolor: 'rgba(255,255,255,0.2)' },

  main: { flexGrow: 1, display: 'flex', flexDirection: 'column' },
  appBar: { backdropFilter: 'blur(4px)', borderBottom: '1px solid #ede7ff', backgroundColor: 'rgba(255,255,255,0.85)' },
  topToolbar: { gap: 2, marginLeft: "24px"},
  searchPaper: { px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, flex: 1, boxShadow: 'none', border: '1px solid #e8e0ff' },
  searchInput: { flex: 1 },
  content: { p: 3 },
  contentContainer: { px: 3 },
  headerTitle: { mb: 4, fontWeight: 700, letterSpacing: 0.2, fontSize: "3em"},
  filtersRow: { mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' },
  selectSmall: { width: 280 },
  selectMedium: { width: 320 },
  columnsWrap: { mt: 3, display: 'flex', gap: '2%', overflowX: 'auto', pb: 1, alignItems: 'flex-start', justifyContent: 'flex-start', width: '100%' },
  column: { width: 350, flex: '0 0 350px' },
  columnPaper: { p: 2, borderRadius: 3, border: '1px solid #d9d9d9', backgroundColor: '#ffffff', boxShadow: '0 3px 10px rgba(106,17,203,0.08), 0 1px 0 rgba(106,17,203,0.06)', padding: "24px"},
  columnTitle: { mb: 1.5, fontWeight: 700, color: '#6A11CB', fontSize: "1.5em"},
  cardHint: { mt: 1, color: 'text.secondary', display: 'block' },
  taskCard: { borderRadius: 2, borderColor: '#d9d9d9', boxShadow: '0 2px 8px rgba(106,17,203,0.10)', transition: 'transform 120ms ease, box-shadow 120ms ease', '&:hover': { boxShadow: '0 6px 16px rgba(78,84,200,0.20)', transform: 'translateY(-1px)', borderColor: '#d5c6ff' } },
  taskCardAction: { borderRadius: 2 },
  taskCardContent: { p: 2 },
  columnEmpty: { py: 8, px: 2, textAlign: 'center', color: 'text.secondary', backgroundColor: '#fbf9ff', border: '1px dashed #e8e0ff', borderRadius: 2 },
  columnEmptyText: { opacity: 0.8 },
  gradientDivider: { height: 3, borderRadius: 2, my: 2, background: 'linear-gradient(90deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)', opacity: 0.5 },

  dialogDescription: { color: 'text.secondary' },
  dialogRow: { mt: 2 },
  dialogSection: { mt: 2 },
  dialogSectionLabel: { display: 'block', mb: 1 },
  dialogAttachments: {},
  dialogPaper: { borderRadius: 3, boxShadow: '0 10px 30px rgba(16,24,40,0.15)' },
  dialogTitleRow: {},
  dialogTitle: { fontWeight: 700},
  dialogDivider: { my: 2 },
  dialogSectionTitle: { letterSpacing: 0.6 },
  dialogInfoRow: { mt: 1, flexWrap: 'wrap' },
  dialogInfoItem: { minWidth: 160 },
  dialogInfoLabel: { color: 'text.secondary' },
  dialogInfoValue: { fontWeight: 500 },
};