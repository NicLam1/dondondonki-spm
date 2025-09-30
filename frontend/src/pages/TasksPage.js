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
  Menu,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

// ---------- API helpers ----------
async function fetchJson(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { credentials: "include" });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    // non-JSON responses ignored
  }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json ?? {};
}

async function apiJson(path, { method = "GET", params, body } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json ?? {};
}

// ---------- UI chips ----------
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

// Editable status dropdown (explicit Select control)
const STATUS_OPTIONS = ["TO_DO", "IN_PROGRESS", "DONE"];
function StatusChipEditable({ task, actingUserId, onLocalUpdate }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newStatus) =>
      apiJson(`/tasks/${task.task_id}/status`, {
        method: "PATCH",
        params: { acting_user_id: String(actingUserId) },
        body: { status: newStatus },
      }),
    onMutate: async (newStatus) => {
      onLocalUpdate?.({ ...task, status: newStatus });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      return {};
    },
    onError: () => {},
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-descendants"] });
      queryClient.invalidateQueries({ queryKey: ["task-ancestors"] });
    },
  });

  const handleChange = (e) => {
    const val = e.target.value;
    if (val && val !== task.status) mutation.mutate(val);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <InputLabel id={`status-label-${task.task_id}`}>Status</InputLabel>
      <Select
        labelId={`status-label-${task.task_id}`}
        value={task.status}
        label="Status"
        onChange={handleChange}
      >
        {STATUS_OPTIONS.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function TaskCard({ task, usersById, onOpen }) {
  // owner/members prepared if you want to display later
  void usersById;
  return (
    <Card variant="outlined" sx={styles.taskCard}>
      <CardActionArea onClick={onOpen} sx={styles.taskCardAction}>
        <CardContent sx={styles.taskCardContent}>
          <Stack spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusChip value={task.status} />
              <PriorityChip value={task.priority} />
            </Stack>
            <Typography variant="h6">{task.title}</Typography>
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

  // Pagination for task list
  const [page, setPage] = useState(0);
  const limit = 50;
  const offset = page * limit;

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
    staleTime: 60_000,
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

  // Strict outrank rule (include self)
  const allowedUsers = useMemo(() => {
    if (!actingUser) return [];
    return users.filter(
      (u) => u.user_id === actingUser.user_id || u.access_level < actingUser.access_level
    );
  }, [users, actingUser]);

  useEffect(() => {
    if (!actingUser) return;
    const actingIdStr = String(actingUser.user_id);
    const prev = prevActingIdRef.current;
    const allowedIds = new Set(allowedUsers.map((u) => String(u.user_id)));
    if (prev !== actingIdStr) {
      prevActingIdRef.current = actingIdStr;
      if (allowedIds.has(actingIdStr)) setViewUserIds([actingIdStr]);
      setPage(0);
      return;
    }
    const pruned = viewUserIds.filter((id) => allowedIds.has(String(id)));
    if (pruned.length !== viewUserIds.length) setViewUserIds(pruned);
    setPage(0);
  }, [actingUser, allowedUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: tasksData,
    isLoading,
    isFetching,
    error: tasksError,
  } = useQuery({
    queryKey: ["tasks", selectedUserId, viewUserIds, page],
    queryFn: () => {
      if (!selectedUserId) return fetchJson("/tasks");
      const params = {
        acting_user_id: selectedUserId,
        limit: String(limit),
        offset: String(offset),
      };
      if (actingUser) {
        if (actingUser.access_level > 0) {
          if (Array.isArray(viewUserIds) && viewUserIds.length > 0) {
            params.user_ids = viewUserIds.join(",");
          }
        } else {
          // non-manager: lock to self
          params.user_ids = String(actingUser.user_id);
        }
      }
      return fetchJson("/tasks", params);
    },
    enabled: Boolean(selectedUserId),
    keepPreviousData: true,
    staleTime: 10_000,
    retry: 1,
    onError: (e) => showError(e?.message || "Failed to load tasks"),
  });

  const tasks = tasksData?.data || [];
  const total = tasksData?.page?.total ?? null;

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

  // Ancestors: backend returns minimal chain (non-deleted)
  const { data: ancestorsData } = useQuery({
    queryKey: ["task-ancestors", selectedTask?.task_id],
    queryFn: () =>
      selectedTask
        ? fetchJson(`/tasks/${selectedTask.task_id}/ancestors`)
        : Promise.resolve({ data: [] }),
    enabled: Boolean(selectedTask?.task_id),
    staleTime: 10_000,
  });
  const ancestorChain = ancestorsData?.data || [];

  // Descendants: allowed if owner or strictly outranks owner
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
    staleTime: 10_000,
  });
  const ownerDescendants = descendantsData?.data || [];

  const subtree = useMemo(() => {
    if (!selectedTask) return [];
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

  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpand = (taskId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
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
  ];

  return (
    <Box sx={styles.root}>
      <Sidebar
        open={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((v) => !v)}
        items={sidebarItems}
        title="DonkiBoard"
      />

      <Box sx={styles.main}>
        <Topbar />

        <Box sx={styles.content}>
          <Container maxWidth={false} disableGutters sx={styles.contentContainer}>
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
                          <Typography variant="subtitle1" sx={styles.columnTitle}>
                            {statusLabels[status]}
                          </Typography>
                          {tasksByStatus[status].length === 0 ? (
                            <Box sx={styles.columnEmpty}>
                              <Typography variant="body2" sx={styles.columnEmptyText}>
                                {isFetching ? "Refreshing…" : "No tasks"}
                              </Typography>
                            </Box>
                          ) : (
                            <Stack spacing={2}>
                              {tasksByStatus[status].map((t) => (
                                <TaskCard
                                  key={t.task_id}
                                  task={t}
                                  usersById={usersById}
                                  onOpen={() => setSelectedTask(t)}
                                />
                              ))}
                            </Stack>
                          )}
                        </Paper>
                      </Box>
                    ))}
                  </Box>

                  {/* Simple pager */}
                  {total != null && (
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
                      <Typography variant="caption">
                        Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
                      </Typography>
                      <Button
                        size="small"
                        disabled={page === 0 || isFetching}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        size="small"
                        disabled={isFetching || offset + limit >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </Stack>
                  )}

                  <Box sx={styles.addTaskFabWrapper} className="rainbow-border">
                    <Button
                      variant="contained"
                      disableElevation
                      startIcon={<AddIcon />}
                      sx={styles.addTaskButton}
                      disabled={!actingUser}
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

      {/* Task dialog */}
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
                  <StatusChipEditable
                    task={selectedTask}
                    actingUserId={actingUser?.user_id}
                    onLocalUpdate={(t) => setSelectedTask(t)}
                  />
                  <PriorityChip value={selectedTask.priority} />
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
                {ancestorChain.length === 0 && (!subtree || subtree.length === 0) ? (
                  <Typography variant="body2" color="text.secondary">None</Typography>
                ) : (
                  <Stack spacing={1}>
                    {(() => {
                      const chain = ancestorChain.concat(selectedTask ? [selectedTask] : []);
                      if (!chain.length) return null;
                      return (
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          {chain.map((t, idx) => (
                            <Stack key={t.task_id} direction="row" spacing={1} alignItems="center">
                              {(() => {
                                const isCurrent = t.task_id === selectedTask.task_id;
                                const accessibleTask = tasksById.get(t.task_id);
                                const isAccessible = Boolean(accessibleTask) || canViewFullSubtree;
                                const handleClick = async () => {
                                  if (isCurrent) return;
                                  if (accessibleTask) {
                                    setSelectedTask(accessibleTask);
                                    return;
                                  }
                                  if (!canViewFullSubtree) {
                                    showError("You don't have permission to view this task.");
                                    return;
                                  }
                                  try {
                                    const resp = await fetchJson(`/tasks/${t.task_id}`, {
                                      acting_user_id: String(actingUser.user_id),
                                    });
                                    if (resp && resp.data) setSelectedTask(resp.data);
                                  } catch (e) {
                                    showError("You lack permissions to view this task.");
                                  }
                                };
                                return (
                                  <Chip
                                    size="small"
                                    label={t.title}
                                    color={isCurrent ? "primary" : undefined}
                                    variant={isCurrent ? "filled" : "outlined"}
                                    onClick={!isCurrent ? handleClick : undefined}
                                    sx={{
                                      cursor: !isCurrent && isAccessible ? "pointer" : "default",
                                      opacity: !isCurrent && !isAccessible ? 0.7 : 1,
                                    }}
                                  />
                                );
                              })()}
                              {idx < chain.length - 1 && (
                                <Typography variant="caption" color="text.secondary">
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
                        <Typography variant="caption" sx={styles.dialogInfoLabel}>
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

              {/**
               * Meta section commented out per request
               *
               * <Divider sx={styles.dialogDivider} />
               * <Box sx={styles.dialogSection}>
               *   <Typography variant="overline" sx={styles.dialogSectionTitle}>Meta</Typography>
               *   ...
               * </Box>
               */}

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
                      <Chip key={idx} label={a.name || "file.pdf"} size="small" />
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

// ---------- styles ----------
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
    boxShadow: "0 3px 10px rgba(106,17,203,0.08), 0 1px 0 rgba(106,17,203,0.06)",
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
    background: "linear-gradient(180deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)",
    color: "#ffffff",
    boxShadow: "0 6px 16px rgba(78,84,200,0.24)",
    "&:hover": {
      background: "linear-gradient(180deg, #6A11CB 0%, #4E54C8 50%, #6A11CB 100%)",
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

  // Subtask tree
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
