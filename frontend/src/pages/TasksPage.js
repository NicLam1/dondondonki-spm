import "../App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
  IconButton,
} from "@mui/material";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PersonIcon from "@mui/icons-material/Person";
import SettingsIcon from "@mui/icons-material/Settings";
import MailIcon from "@mui/icons-material/Mail";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete"; // ADD THIS LINE
// import MenuOpenIcon from '@mui/icons-material/MenuOpen';
// import MenuIcon from '@mui/icons-material/Menu';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import DeleteButton from '../components/DeleteButton';
import PrioritySelector from '../components/PrioritySelector';


const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

async function fetchJson(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Network error");
  return res.json();
}

function StatusChip({ value }) {
  const color =
    value === "DONE"
      ? "success"
      : value === "IN_PROGRESS"
      ? "warning"
      : "default";
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

function PriorityChip({ value }) {
  const color =
    value === "HIGH" ? "error" : value === "MEDIUM" ? "warning" : "default";
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

function TaskCard({ task, usersById, onOpen, actingUser, onPriorityUpdate  }) {
  const owner = usersById.get(task.owner_id);
  const members = (task.members_id || [])
    .map((id) => usersById.get(id))
    .filter(Boolean);
  return (
    <Card variant="outlined" sx={styles.taskCard}>
      <CardActionArea onClick={onOpen} sx={styles.taskCardAction}>
        <CardContent sx={styles.taskCardContent}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="h6">{task.title}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusChip value={task.status} />
              <Box onClick={(e) => e.stopPropagation()}>
                  <PrioritySelector
                    task={task}
                    actingUser={actingUser}
                    onSuccess={(message, updatedTask) => {
                      if (onPriorityUpdate) onPriorityUpdate(message, updatedTask);
                    }}
                    onError={(error) => {
                      if (onPriorityUpdate) onPriorityUpdate(null, null, error);
                    }}
                    size="small"
                  />
                </Box>
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
  const [selectedUserId, setSelectedUserId] = useState("");
  const [viewUserIds, setViewUserIds] = useState([]);
  const prevActingIdRef = useRef(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const queryClient = useQueryClient();

  const SIDEBAR_WIDTH = 240;
  const SIDEBAR_MINI_WIDTH = 80;

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "error",
  });
  const showError = (msg) =>
    setSnackbar({ open: true, message: msg, severity: "error" });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchJson("/users"),
  });

  const users = usersData?.data || [];
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.user_id, u])),
    [users]
  );

  useEffect(() => {
    if (users.length && !selectedUserId) {
      setSelectedUserId(String(users[0].user_id));
    }
  }, [users, selectedUserId]);

  const actingUser = useMemo(
    () => users.find((u) => String(u.user_id) === String(selectedUserId)),
    [users, selectedUserId]
  );
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
    queryKey: ["tasks", selectedUserId, viewUserIds],
    queryFn: () =>
      fetchJson(
        "/tasks",
        selectedUserId
          ? {
              acting_user_id: selectedUserId,
              user_ids: actingUser
                ? actingUser.access_level > 0
                  ? viewUserIds && viewUserIds.length
                    ? viewUserIds.join(",")
                    : ""
                  : String(actingUser.user_id)
                : undefined,
            }
          : undefined
      ),
    enabled: Boolean(selectedUserId),
  });

  const tasks =
    actingUser && actingUser.access_level > 0 && viewUserIds.length === 0
      ? []
      : tasksData?.data || [];
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.task_id, t])),
    [tasks]
  );
  const childrenByParentId = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const parentId = t.parent_task_id;
      if (parentId == null) continue;
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId).push(t);
    }
    return map;
  }, [tasks]);
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const tasksByStatus = useMemo(() => {
    const group = { TO_DO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of tasks) {
      if (t.status === "IN_PROGRESS") group.IN_PROGRESS.push(t);
      else if (t.status === "DONE") group.DONE.push(t);
      else group.TO_DO.push(t);
    }
    Object.keys(group).forEach((k) =>
      group[k].sort(
        (a, b) =>
          (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99)
      )
    );
    return group;
  }, [tasks]);

  // Hierarchy helpers for modal
  // Ancestors: fetch from backend to include hidden parents
  const { data: ancestorsData } = useQuery({
    queryKey: ["task-ancestors", selectedTask?.task_id],
    queryFn: () =>
      selectedTask
        ? fetchJson(`/tasks/${selectedTask.task_id}/ancestors`)
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedTask?.task_id),
  });
  const ancestorChain = ancestorsData?.data || [];

  // Fetch full descendants when allowed: owner or higher access than owner
  const selectedOwner = useMemo(
    () => (selectedTask ? usersById.get(selectedTask.owner_id) : null),
    [selectedTask, usersById]
  );
  const canViewFullSubtree = useMemo(() => {
    if (!selectedTask || !actingUser) return false;
    if (selectedTask.owner_id === actingUser.user_id) return true;
    if (
      selectedOwner &&
      typeof selectedOwner.access_level === "number" &&
      typeof actingUser.access_level === "number"
    ) {
      return actingUser.access_level > selectedOwner.access_level;
    }
    return false;
  }, [selectedTask, actingUser, selectedOwner]);
  const { data: descendantsData } = useQuery({
    queryKey: ["task-descendants", selectedTask?.task_id, canViewFullSubtree],
    queryFn: () =>
      selectedTask && canViewFullSubtree
        ? fetchJson(`/tasks/${selectedTask.task_id}/descendants`)
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedTask?.task_id && canViewFullSubtree),
  });
  const ownerDescendants = descendantsData?.data || [];

  const subtree = useMemo(() => {
    if (!selectedTask) return [];
    // If allowed, build from fetched descendants (full), else from visible tasks
    const sourceChildrenByParent = (() => {
      if (!canViewFullSubtree) return childrenByParentId;
      const map = new Map();
      for (const d of ownerDescendants) {
        const pid = d.parent_task_id;
        if (pid == null) continue;
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push(d);
      }
      return map;
    })();
    const build = (task) => {
      const children = sourceChildrenByParent.get(task.task_id) || [];
      return children.map((c) => ({ task: c, children: build(c) }));
    };
    return build(selectedTask);
  }, [selectedTask, childrenByParentId, canViewFullSubtree, ownerDescendants]);

  // Expanded/collapsed state for subtask tree
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpand = (taskId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  // Ensure top-level nodes are expanded by default when subtree changes
  useEffect(() => {
    if (!subtree || subtree.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const n of subtree) next.add(n.task.task_id);
      return next;
    });
  }, [subtree]);

  const renderTree = (nodes, depth = 0) => (
    <Stack spacing={0.25}>
      {nodes.map((n) => {
        const hasChildren = !!(n.children && n.children.length);
        const nodeId = n.task.task_id;
        const isExpanded = hasChildren ? expandedIds.has(nodeId) : false;
        const accessibleTask = tasksById.get(nodeId);
        const isAccessible = Boolean(accessibleTask) || canViewFullSubtree;
        return (
          <Box key={nodeId} sx={{ ml: depth * 1.5 }}>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={styles.subtaskRow}
            >
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => toggleExpand(nodeId)}
                  sx={styles.subtaskArrowButton}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon fontSize="inherit" />
                  ) : (
                    <ChevronRightIcon fontSize="inherit" />
                  )}
                </IconButton>
              ) : (
                <Box sx={styles.subtaskArrowPlaceholder} />
              )}
              <Button
                size="small"
                variant="text"
                onClick={async () => {
                  if (accessibleTask) {
                    setSelectedTask(accessibleTask);
                    return;
                  }
                  if (!canViewFullSubtree) {
                    showError("You don't have permission to view this task.");
                    return;
                  }
                  try {
                    const resp = await fetchJson(`/tasks/${nodeId}`, {
                      acting_user_id: String(actingUser.user_id),
                    });
                    if (resp && resp.data) setSelectedTask(resp.data);
                  } catch (e) {
                    showError("Unable to load task.");
                  }
                }}
                sx={styles.subtaskTitleButton}
                disabled={false}
              >
                <Typography
                  variant="body2"
                  color={isAccessible ? undefined : "text.secondary"}
                  sx={{
                    ...styles.subtaskTitleText,
                    opacity: isAccessible ? 1 : 0.7,
                  }}
                >
                  {n.task.title}
                </Typography>
              </Button>
            </Stack>
            {hasChildren && isExpanded ? (
              <Box sx={styles.subtaskChildren}>
                {renderTree(n.children, depth + 1)}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
  const statusLabels = {
    TO_DO: "To Do",
    IN_PROGRESS: "In Progress",
    DONE: "Completed",
  };

  const sidebarItems = [
    { key: "dashboard", icon: <DashboardIcon />, label: "Dashboard" },
    { key: "profile", icon: <PersonIcon />, label: "Profile" },
    { key: "settings", icon: <SettingsIcon />, label: "Settings" },
    { key: "messages", icon: <MailIcon />, label: "Messages", badge: 12 },
    { key: "trash", icon: <DeleteIcon />, label: "Trash" }, 
  ];

  return (
    <Box sx={styles.root}>
      <Sidebar
        open={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((v) => !v)}
        items={sidebarItems}
        title="DonkiBoard"
        onItemClick={(key) => {  // ADD THIS ENTIRE onItemClick function
          if (key === "trash") {
            window.location.href = "/trash";
          }
        }}
      />

      <Box sx={styles.main}>
        <Topbar />

        <Box sx={styles.content}>
          <Container
            maxWidth={false}
            disableGutters
            sx={styles.contentContainer}
          >
            <Box sx={styles.headerRow}>
              <Typography variant="h5" sx={styles.headerTitle}>
                Tasks
              </Typography>
            </Box>

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
                    onChange={(e) =>
                      setViewUserIds(
                        Array.isArray(e.target.value) ? e.target.value : []
                      )
                    }
                    renderValue={(selected) => {
                      const sel = Array.isArray(selected) ? selected : [];
                      if (!sel.length) return "";
                      const onlyMe =
                        actingUser &&
                        sel.length === 1 &&
                        String(sel[0]) === String(actingUser.user_id);
                      if (onlyMe) return "Me";
                      if (sel.length > 1) return `${sel.length} members`;
                      const name = usersById.get(Number(sel[0]))?.full_name;
                      return name || "";
                    }}
                  >
                    {allowedUsers.map((u) => {
                      const idStr = String(u.user_id);
                      const checked = viewUserIds.indexOf(idStr) > -1;
                      const label =
                        actingUser && String(actingUser.user_id) === idStr
                          ? "Me"
                          : `${u.full_name} (${u.role})`;
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
                <Box sx={styles.taskSection}>
                  <Box sx={styles.gradientDivider} />
                  <Box sx={styles.columnsWrap}>
                    {["TO_DO", "IN_PROGRESS", "DONE"].map((status) => (
                      <Box key={status} sx={styles.column}>
                        <Paper elevation={0} sx={styles.columnPaper}>
                          <Typography
                            variant="subtitle1"
                            sx={styles.columnTitle}
                          >
                            {statusLabels[status]}
                          </Typography>
                          {tasksByStatus[status].length === 0 ? (
                            <Box sx={styles.columnEmpty}>
                              <Typography
                                variant="body2"
                                sx={styles.columnEmptyText}
                              >
                                No tasks
                              </Typography>
                            </Box>
                          ) : (
                            <Stack spacing={2}>
                              {tasksByStatus[status].map((t) => (
                                <TaskCard
                                  key={t.task_id}
                                  task={t}
                                  usersById={usersById}
                                  actingUser={actingUser}
                                  onOpen={() => setSelectedTask(t)}
                                  onPriorityUpdate={(message, updatedTask, error) => {
                                    if (error) {
                                      setSnackbar({ open: true, message: error, severity: "error" });
                                    } else if (message) {
                                      setSnackbar({ open: true, message, severity: "success" });
                                      queryClient.invalidateQueries(['tasks']);
                                    }
                                  }}
                                />
                              ))}
                            </Stack>
                          )}
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                  <Box sx={styles.addTaskFabWrapper} className="rainbow-border">
                    <Button
                      variant="contained"
                      disableElevation
                      startIcon={<AddIcon />}
                      sx={styles.addTaskButton}
                    >
                      Add task
                    </Button>
                  </Box>
                </Box>
              </>
            )}
          </Container>
        </Box>
      </Box>

      <Dialog
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: styles.dialogPaper }}
      >
        {selectedTask && (
          <>
            <DialogTitle>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
                sx={styles.dialogTitleRow}
              >
                <Typography variant="h6" sx={styles.dialogTitle}>
                  {selectedTask.title}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <StatusChip value={selectedTask.status} />
                  <PrioritySelector
                    task={selectedTask}
                    actingUser={actingUser}
                    onSuccess={(message, updatedTask) => {
                      setSnackbar({ open: true, message, severity: "success" });
                      setSelectedTask(updatedTask);
                      queryClient.invalidateQueries(['tasks']);
                    }}
                    onError={(error) => setSnackbar({ open: true, message: error, severity: "error" })}
                  />
                </Stack>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Overview
                </Typography>
                <Typography variant="body1" sx={styles.dialogDescription}>
                  {selectedTask.description || "No description."}
                </Typography>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Hierarchy
                </Typography>
                {ancestorChain.length === 0 &&
                (!subtree || subtree.length === 0) ? (
                  <Typography variant="caption" color="text.secondary">
                    No hierarchy
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {(() => {
                      const chain = ancestorChain.concat(
                        selectedTask ? [selectedTask] : []
                      );
                      if (!chain.length) return null;
                      return (
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          flexWrap="wrap"
                        >
                          {chain.map((t, idx) => (
                            <Stack
                              key={t.task_id}
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              {(() => {
                                const isCurrent =
                                  t.task_id === selectedTask.task_id;
                                const accessibleTask = tasksById.get(t.task_id);
                                const isAccessible =
                                  Boolean(accessibleTask) || canViewFullSubtree;
                                const handleClick = async () => {
                                  if (isCurrent) return;
                                  if (accessibleTask) {
                                    setSelectedTask(accessibleTask);
                                    return;
                                  }
                                  if (!canViewFullSubtree) {
                                    showError(
                                      "You don't have permission to view this task."
                                    );
                                    return;
                                  }
                                  try {
                                    const resp = await fetchJson(
                                      `/tasks/${t.task_id}`,
                                      {
                                        acting_user_id: String(
                                          actingUser.user_id
                                        ),
                                      }
                                    );
                                    if (resp && resp.data)
                                      setSelectedTask(resp.data);
                                  } catch (e) {
                                    showError(
                                      "You lack permissions to view this task."
                                    );
                                  }
                                };
                                return (
                                  <Chip
                                    size="small"
                                    label={t.title}
                                    color={isCurrent ? "primary" : undefined}
                                    variant={isCurrent ? "filled" : "outlined"}
                                    onClick={
                                      !isCurrent ? handleClick : undefined
                                    }
                                    sx={{
                                      cursor:
                                        !isCurrent && isAccessible
                                          ? "pointer"
                                          : "default",
                                      opacity:
                                        !isCurrent && !isAccessible ? 0.7 : 1,
                                    }}
                                  />
                                );
                              })()}
                              {idx < chain.length - 1 && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  /
                                </Typography>
                              )}
                            </Stack>
                          ))}
                        </Stack>
                      );
                    })()}
                    {subtree && subtree.length > 0 && (
                      <Box>
                        <Typography
                          variant="caption"
                          sx={styles.dialogInfoLabel}
                        >
                          Subtasks
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>{renderTree(subtree)}</Box>
                      </Box>
                    )}
                  </Stack>
                )}
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Details
                </Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Project
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.project || "—"}
                    </Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Due date
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.due_date
                        ? new Date(selectedTask.due_date).toLocaleDateString()
                        : "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  People
                </Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Owner
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {usersById.get(selectedTask.owner_id)?.full_name || "—"}
                    </Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Members
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {(selectedTask.members_id || [])
                        .map((id) => usersById.get(id)?.full_name)
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Meta
                </Typography>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Task ID
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.task_id}
                    </Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Parent
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.parent_task_id ?? "—"}
                    </Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Deleted
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.is_deleted ? "Yes" : "No"}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Created
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.created_at
                        ? new Date(selectedTask.created_at).toLocaleString()
                        : "—"}
                    </Typography>
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Updated
                    </Typography>
                    <Typography variant="body2" sx={styles.dialogInfoValue}>
                      {selectedTask.updated_at
                        ? new Date(selectedTask.updated_at).toLocaleString()
                        : "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Attachments
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  sx={styles.dialogAttachments}
                >
                  {(selectedTask.attachments || []).length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No attachments
                    </Typography>
                  ) : (
                    (selectedTask.attachments || []).map((a, idx) => (
                      <Chip
                        key={idx}
                        label={a.name || "file.pdf"}
                        size="small"
                      />
                    ))
                  )}
                </Stack>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedTask(null)}>Close</Button>
              <DeleteButton 
                task={selectedTask} 
                actingUserId={selectedUserId}
                onSuccess={(message) => {
                  setSnackbar({ open: true, message, severity: "success" });
                  setSelectedTask(null);
                  // Refresh tasks
                  window.location.reload(); // Simple refresh, or use queryClient if you add it
                  
                }}
                onError={(error) => setSnackbar({ open: true, message: error, severity: "error" })}
              />
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// styles
const styles = {
  root: { display: "flex", minHeight: "100vh", bgcolor: "#f6f7fb" },
  flexGrow: { flexGrow: 1 },

  main: { flexGrow: 1, display: "flex", flexDirection: "column" },
  content: { p: 3 },
  contentContainer: { px: 3 },
  headerRow: {
    mb: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { m: 0, fontWeight: 700, letterSpacing: 0.2, fontSize: "3em" },
  filtersRow: { mb: 3, display: "flex", gap: 2, flexWrap: "wrap" },
  selectSmall: { width: 280 },
  selectMedium: { width: 320 },
  taskSection: { position: "relative", minHeight: 200 },
  columnsWrap: {
    mt: 3,
    display: "flex",
    gap: "2%",
    overflowX: "auto",
    pb: 1,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    width: "100%",
  },
  column: { width: 350, flex: "0 0 350px" },
  columnPaper: {
    p: 2,
    borderRadius: 3,
    border: "1px solid #d9d9d9",
    backgroundColor: "#ffffff",
    boxShadow:
      "0 3px 10px rgba(106,17,203,0.08), 0 1px 0 rgba(106,17,203,0.06)",
    padding: "24px",
  },
  columnTitle: {
    mb: 1.5,
    fontWeight: 700,
    color: "#6A11CB",
    fontSize: "1.5em",
  },
  cardHint: { mt: 1, color: "text.secondary", display: "block" },
  taskCard: {
    borderRadius: 2,
    borderColor: "#d9d9d9",
    boxShadow: "0 2px 8px rgba(106,17,203,0.10)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    "&:hover": {
      boxShadow: "0 6px 16px rgba(78,84,200,0.20)",
      transform: "translateY(-1px)",
      borderColor: "#d5c6ff",
    },
  },
  taskCardAction: { borderRadius: 2 },
  taskCardContent: { p: 2 },
  columnEmpty: {
    py: 8,
    px: 2,
    textAlign: "center",
    color: "text.secondary",
    backgroundColor: "#fbf9ff",
    border: "1px dashed #e8e0ff",
    borderRadius: 2,
  },
  columnEmptyText: { opacity: 0.8 },
  gradientDivider: {
    height: 3,
    borderRadius: 2,
    my: 2,
    background: "linear-gradient(90deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)",
    opacity: 0.5,
  },
  addTaskFabWrapper: {
    position: "fixed",
    right: 24,
    bottom: 24,
    borderRadius: 9999,
    zIndex: 1100,
  },
  addTaskButton: {
    textTransform: "none",
    fontWeight: 700,
    borderRadius: 9999,
    fontSize: "1rem",
    px: 4.25,
    py: 1.5,
    background:
      "linear-gradient(180deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)",
    color: "#ffffff",
    boxShadow: "0 6px 16px rgba(78,84,200,0.24)",
    "&:hover": {
      background:
        "linear-gradient(180deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)",
      boxShadow: "0 10px 24px rgba(78,84,200,0.28)",
    },
  },

  dialogDescription: { color: "text.secondary" },
  dialogRow: { mt: 2 },
  dialogSection: { mt: 2 },
  dialogSectionLabel: { display: "block", mb: 1 },
  dialogAttachments: {},
  dialogPaper: {
    borderRadius: 3,
    boxShadow: "0 10px 30px rgba(16,24,40,0.15)",
  },
  dialogTitleRow: {},
  dialogTitle: { fontWeight: 700 },
  dialogDivider: { my: 2 },
  dialogSectionTitle: { letterSpacing: 0.6 },
  dialogInfoRow: { mt: 1, flexWrap: "wrap" },
  dialogInfoItem: { minWidth: 160 },
  dialogInfoLabel: { color: "text.secondary" },
  dialogInfoValue: { fontWeight: 500 },
  // Subtask tree styles
  subtaskRow: {
    py: 0.25,
    px: 0.5,
    borderRadius: 1,
    "&:hover": { backgroundColor: "rgba(106,17,203,0.06)" },
  },
  subtaskArrowButton: {
    p: 0.25,
    color: "text.secondary",
    "&:hover": { backgroundColor: "transparent", color: "#6A11CB" },
  },
  subtaskArrowPlaceholder: { width: 28, height: 28 },
  subtaskTitleButton: {
    textTransform: "none",
    p: 0.25,
    minWidth: 0,
    justifyContent: "flex-start",
  },
  subtaskTitleText: {
    fontWeight: 500,
    "&:hover": { textDecoration: "underline" },
  },
  subtaskChildren: {
    ml: 1.5,
    pl: 1,
    borderLeft: "1px dashed #e0e0e0",
  },
};
