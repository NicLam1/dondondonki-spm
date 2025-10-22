import "../App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from 'react-router-dom';
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
  TextField,
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
import DeleteIcon from "@mui/icons-material/Delete";
import FolderIcon from '@mui/icons-material/Folder';
import TaskIcon from '@mui/icons-material/Task';
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

//OUR COMPONENT IMPORTS
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import DeleteButton from '../components/DeleteButton';
import PrioritySelector from '../components/PrioritySelector';
import TaskForm from '../components/TaskForm';
import ActivityLog from '../components/ActivityLog';
import AttachmentManager from '../components/AttachmentManager';


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

// No normalization needed; using canonical statuses only

// ---------- UI chips ----------
function StatusChip({ value }) {
  const color =
    value === "COMPLETED"
      ? "success"
      : value === "UNDER_REVIEW"
      ? "info"
      : "default";
  const labelMap = {
    UNASSIGNED: "Unassigned",
    ONGOING: "Ongoing",
    UNDER_REVIEW: "Under Review",
    COMPLETED: "Completed",
  };
  return <Chip label={labelMap[value] || value} color={color} variant="outlined" size="small" />;
}

function PriorityChip({ value }) {
  const bucket = Number.isInteger(value) ? value : null;
  const color = bucket != null ? (bucket <= 3 ? "error" : bucket <= 7 ? "warning" : "default") : "default";
  const label = bucket != null ? `P${bucket}` : "P?";
  return <Chip label={label} color={color} variant="outlined" size="small" />;
}


// function TaskCard({ task, usersById, onOpen}) {
//   const owner = usersById.get(task.owner_id);
//   const members = (task.members_id || [])
//     .map((id) => usersById.get(id))
//     .filter(Boolean);}

// Editable status dropdown (explicit Select control)
const STATUS_OPTIONS = ["UNASSIGNED", "ONGOING", "UNDER_REVIEW", "COMPLETED"];
 function StatusChipEditable({ task, actingUserId, onLocalUpdate, onError }) {
  const queryClient = useQueryClient();

   const mutation = useMutation({
    // mutationFn: async (newStatus) =>
    //   apiJson(`/tasks/${task.task_id}/status`, {
    //     method: "PATCH",
    //     params: { acting_user_id: String(actingUserId) },
    //     body: { status: newStatus },
    //   }),
      mutationFn: async (newStatus) => {
    console.log('🔄 Updating task status:', { taskId: task.task_id, newStatus, actingUserId });
    
    // Check if this is a recurring task being completed
    if (newStatus === 'COMPLETED' && task.is_recurring) {
      console.log('🔄 Recurring task being completed');
    }
    
    const response = await fetch(`${API_BASE}/tasks/${task.task_id}/status?acting_user_id=${actingUserId}`, {
      method: 'PATCH', // Make sure this is PATCH, not GET
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  },
  //   onMutate: async (newStatus) => {
  //     // Guard: cannot change from UNASSIGNED without an assignee
  //     if ((task.assignee_id == null) && newStatus !== 'UNASSIGNED') {
  //        throw new Error('Assign someone before changing status');
  //     }
  //     // Guard: cannot set UNASSIGNED when an assignee exists
  //     if ((task.assignee_id != null) && newStatus === 'UNASSIGNED') {
  //       throw new Error('Remove assignee before changing status to Unassigned');
  //     }
  //     onLocalUpdate?.({ ...task, status: newStatus });
  //     await queryClient.cancelQueries({ queryKey: ["tasks"] });
  //     return {};
  //   },
  //    onError: (e) => {
  //      const message = e?.message || 'Unable to update status';
  //      onError?.(message);
  //    },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["tasks"] });
  //     queryClient.invalidateQueries({ queryKey: ["task-descendants"] });
  //     queryClient.invalidateQueries({ queryKey: ["task-ancestors"] });
  //     if (task?.task_id) {
  //       queryClient.invalidateQueries({ queryKey: ["task-activity", task.task_id] });
  //     }
  //   },
  // });
    onMutate: async (newStatus) => {
      // Guard: cannot change from UNASSIGNED without an assignee
      if ((task.assignee_id == null) && newStatus !== 'UNASSIGNED') {
         throw new Error('Assign someone before changing status');
      }
      // Guard: cannot set UNASSIGNED when an assignee exists
      if ((task.assignee_id != null) && newStatus === 'UNASSIGNED') {
        throw new Error('Remove assignee before changing status to Unassigned');
      }
      onLocalUpdate?.({ ...task, status: newStatus });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      return {};
    },
    
    onError: (e) => {
       const message = e?.message || 'Unable to update status';
       onError?.(message);
     },
     
    onSuccess: (data) => {
      console.log('✅ Status update successful:', data);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-descendants"] });
      queryClient.invalidateQueries({ queryKey: ["task-ancestors"] });
      if (task?.task_id) {
        queryClient.invalidateQueries({ queryKey: ["task-activity", task.task_id] });
      }
    },
});

  const handleChange = (e) => {
    const val = e.target.value;
    if (!val || val === task.status) return;
    if (task.assignee_id == null && val !== 'UNASSIGNED') {
      onError?.('Assign someone before changing status');
      return;
    }
    if (task.assignee_id != null && val === 'UNASSIGNED') {
      onError?.('Remove assignee before changing status to Unassigned');
      return;
    }
    mutation.mutate(val);
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

function TaskCard({ task, usersById, onOpen, actingUser, onPriorityUpdate, onAddSubtask }) {
  // owner/members prepared if you want to display later
  void usersById;

  // Check if task is overdue
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'COMPLETED';

  return (
    <Card variant="outlined" sx={{
      ...styles.taskCard,
      ...(isOverdue && { borderColor: "#f44336", backgroundColor: "#ffebee" })
    }}>
      <CardActionArea onClick={onOpen} sx={styles.taskCardAction}>
        <CardContent sx={styles.taskCardContent}>
          <Stack spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <StatusChip value={task.assignee_id == null ? 'UNASSIGNED' : task.status} />
              <PriorityChip value={task.priority_bucket} />
              {isOverdue && <Chip label="OVERDUE" size="small" color="error" />}
            </Stack>
            <Typography variant="h6" sx={isOverdue ? { color: '#d32f2f' } : undefined}>
              {task.title}
            </Typography>
            {/* Add Subtask button */}
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                onAddSubtask(task);
              }}
              sx={{
                mt: 1,
                textTransform: "none",
                fontSize: "0.75rem",
                borderColor: "#6A11CB",
                color: "#6A11CB",
                "&:hover": {
                  borderColor: "#4E54C8",
                  backgroundColor: "rgba(106,17,203,0.04)",
                },
              }}
            >
              Add Subtask
            </Button>
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
  const [editMode, setEditMode] = useState(false);   
  const [draft, setDraft] = useState(null);          
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [selectedTaskForSubtask, setSelectedTaskForSubtask] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();


  const queryClient = useQueryClient();

  const SIDEBAR_WIDTH = 240;
  const SIDEBAR_MINI_WIDTH = 80;

  // // Fetch users for the task form
  // useEffect(() => {
  //   const fetchUsers = async () => {
  //     try {
  //       const response = await fetch('/api/users');
  //       const result = await response.json();
  //       setUsers(result.data || []);
  //     } catch (error) {
  //       console.error('Error fetching users:', error);
  //     }
  //   };
  //   fetchUsers();
  // }, []);


  // Initialize acting user from localStorage (authenticated user)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      const id = stored?.profile?.user_id ?? stored?.user_id ?? null;
      if (id) setSelectedUserId(String(id));
    } catch (_) {
      // ignore malformed localStorage
    }
  }, []);

const handleTaskCreated = (newTask) => {
  // Refresh tasks after creation
  queryClient.invalidateQueries(['tasks']);
  setIsTaskFormOpen(false);
  setSelectedTaskForSubtask(null);
  
  // If the created task has attachments and it's currently selected, force refresh
  if (selectedTask && selectedTask.task_id === newTask.task_id) {
    setSelectedTask(newTask); // This will trigger AttachmentManager to refetch
  }

  // Show success message
  setSnackbar({
    open: true,
    message: selectedTaskForSubtask 
      ? `Subtask "${newTask.title}" created successfully!`
      : `Task "${newTask.title}" created successfully!`,
    severity: "success"
  });
};


  const openSubtaskForm = (task) => {
    setSelectedTaskForSubtask(task);
    setIsTaskFormOpen(true);
    setIsSearchFocused(false); // Unfocus search bar
    
  };

  const openTaskForm = () => {
    setSelectedTaskForSubtask(null);
    setIsTaskFormOpen(true);
    setIsSearchFocused(false); // Unfocus search bar
  };

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

  const showSuccess = (msg) =>
  setSnackbar({ open: true, message: msg, severity: "success" }); 

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

  const actingUser = useMemo(() => {
    const found = users.find((u) => String(u.user_id) === String(selectedUserId));
    if (found) {
      console.log('✅ Found acting user:', found);
      return found;
    }
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      const uid = stored?.profile?.user_id ?? stored?.user_id;
      if (uid) {
        console.log('⚠️ Using stored user, looking for:', uid);
        const storedUser = users.find((u) => u.user_id === uid);
        if (storedUser) {
          console.log('✅ Found stored user:', storedUser);
          return storedUser;
        }
        console.log('❌ Stored user not found in users list');
        return { ...stored, user_id: uid };
      }
    } catch (_) {}
    console.log('❌ No acting user found');
    return null;
  }, [users, selectedUserId]);

  // KEEP: Team/Department hierarchy logic for frontend user selection
  // OPTION 1: Directors only see subordinates (not peer directors)
  const allowedUsers = useMemo(() => {
    if (!actingUser || !users.length) return [];
    
    console.log('🔍 allowedUsers calculation:', {
      actingUser: actingUser.full_name,
      access_level: actingUser.access_level,
      team_id: actingUser.team_id,
      department_id: actingUser.department_id
    });
    
    // Always include self
    const allowed = [actingUser];
    
    if (actingUser.access_level === 0) {
      // Staff: only self
      return allowed;
    } else if (actingUser.access_level === 1) {
      // Manager: only subordinates (access_level < 1) in same team
      const subordinates = users.filter(u => 
        u.user_id !== actingUser.user_id && // Exclude self (already added)
        u.team_id === actingUser.team_id &&
        u.access_level < actingUser.access_level // Only staff (level 0)
      );
      console.log('👥 Manager - subordinates only:', subordinates.map(u => u.full_name));
      return [...allowed, ...subordinates];
    } else if (actingUser.access_level === 2) {
      // Director: only subordinates (access_level < 2) in same department
      const subordinates = users.filter(u => 
        u.user_id !== actingUser.user_id && // Exclude self (already added)
        u.department_id === actingUser.department_id &&
        u.access_level < actingUser.access_level // Only managers and staff (levels 0,1)
      );
      console.log('🏢 Director - subordinates only:', subordinates.map(u => u.full_name));
      return [...allowed, ...subordinates];
    } else if (actingUser.access_level === 3) {
      // HR: everyone
      console.log('👑 HR - can see everyone');
      return users;
    }
    
    // Fallback: only self
    return allowed;
  }, [users, actingUser]);

  // SIMPLIFIED: Auto-set viewUserIds based on access level without dropdown
  useEffect(() => {
    if (!actingUser) return;
    const actingIdStr = String(actingUser.user_id);
    const allowedIds = allowedUsers.map((u) => String(u.user_id));

    // Always set to view all allowed users automatically
    setViewUserIds(allowedIds);
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
          // Manager view: if nothing is selected in the multi-select, show no tasks
          if (Array.isArray(viewUserIds) && viewUserIds.length === 0) {
            return Promise.resolve({ data: [], page: { total: 0 } });
          }
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

  const tasksByStatus = useMemo(() => {
    const group = { UNASSIGNED: [], ONGOING: [], UNDER_REVIEW: [], COMPLETED: [] };
    // Show all tasks (including subtasks) in their respective columns
    for (const t of tasks) {
      const derived = t.assignee_id == null ? 'UNASSIGNED' : (t.status || 'ONGOING');
      if (group[derived]) group[derived].push(t); 
      else group.UNASSIGNED.push(t);
    }
    Object.keys(group).forEach((k) =>
      group[k].sort((a, b) => {
        const av = Number.isInteger(a.priority_bucket) ? a.priority_bucket : 999;
        const bv = Number.isInteger(b.priority_bucket) ? b.priority_bucket : 999;
        return av - bv; // lower bucket number = higher priority
      })
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
    if (selectedTask.assignee_id === actingUser.user_id) return true;
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
                    setEditMode(false);
                    setDraft(null);
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
                    if (resp && resp.data) {
                      setSelectedTask(resp.data)
                      setEditMode(false);
                      setDraft(null);
                    }
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
  // Removed duplicate queryClient declaration
  const editMutation = useMutation({
    mutationFn: (payload) =>
      apiJson(`/tasks/${selectedTask.task_id}`, {
        method: "PATCH",
        params: { acting_user_id: String(actingUser?.user_id) },
        body: payload,
      }),
    onSuccess: (resp) => {
      const updated = resp?.data;
      if (updated) {
        setSelectedTask(updated);
        setEditMode(false);
        setDraft(null);
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({ queryKey: ["task-ancestors"] });
        queryClient.invalidateQueries({ queryKey: ["task-descendants"] });
        if (selectedTask?.task_id) {
          queryClient.invalidateQueries({ queryKey: ["task-activity", selectedTask.task_id] });
        }
        showSuccess("Task updated");
      }
    },
    onError: (e) => showError(e?.message || "Failed to save task"),
  });
  const statusLabels = {
    UNASSIGNED: "Unassigned",
    ONGOING: "Ongoing",
    UNDER_REVIEW: "Under Review",
    COMPLETED: "Completed",
  };

  const sidebarItems = [
    { key: "dashboard", icon: <DashboardIcon />, label: "Dashboard" },
    { key: "tasks", icon: <TaskIcon />, label: "Tasks" },
    { key: "calendar", icon: <CalendarMonthIcon />, label: "Calendar" },
    { key: "projects", icon: <FolderIcon />, label: "Projects" },
    { key: "profile", icon: <PersonIcon />, label: "Profile" },
    { key: "settings", icon: <SettingsIcon />, label: "Settings" },
    { key: "messages", icon: <MailIcon />, label: "Messages", badge: 12 },
    { key: "trash", icon: <DeleteIcon />, label: "Trash" }, 
  ];

  // NEW: Handle URL task parameter to auto-open task dialog
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId && actingUser) {
      const taskIdNum = parseInt(taskId, 10);
      if (Number.isInteger(taskIdNum)) {
        // Check if task is already in our current tasks list
        const existingTask = tasks.find(t => t.task_id === taskIdNum);
        if (existingTask) {
          setSelectedTask(existingTask);
          setEditMode(false);
          setDraft(null);
        } else {
          // Fetch the specific task
          fetchJson(`/tasks/${taskIdNum}`, { acting_user_id: String(actingUser.user_id) })
            .then(resp => {
              if (resp?.data) {
                setSelectedTask(resp.data);
                setEditMode(false);
                setDraft(null);
              }
            })
            .catch(e => showError("Unable to load task."));
        }
        
        // Remove task parameter from URL to clean it up
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('task');
          return newParams;
        });
      }
    }
  }, [searchParams, actingUser, tasks, setSearchParams]);

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
          } else if (key === "calendar") {
            window.location.href = "/calendar";
          }
        }}
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
              {/* REMOVED: "View tasks of" dropdown - now shows all allowed users automatically */}
            </Box>

            {isLoading ? (
              <Typography variant="body1">Loading tasks…</Typography>
            ) : (
              <>
                <Box sx={styles.taskSection}>
                  <Box sx={styles.gradientDivider} />
                  <Box sx={styles.columnsWrap}>
                    {["UNASSIGNED", "ONGOING", "UNDER_REVIEW", "COMPLETED"].map((status) => (
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
                                  onOpen={() => { setSelectedTask(t); setEditMode(false); setDraft(null); }}
                                  actingUser={actingUser}
                                  onAddSubtask={openSubtaskForm}
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
                      onClick = {openTaskForm}>
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
        onClose={() => { setSelectedTask(null); setEditMode(false); setDraft(null); }}
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
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Title"
                    value={draft?.title ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                ) : (
                  <Typography variant="h6" sx={styles.dialogTitle}>{selectedTask.title}</Typography>
                )}
                <Stack direction="row" spacing={1}>
                   <StatusChipEditable
                    task={selectedTask}
                    actingUserId={actingUser?.user_id}
                    onLocalUpdate={(updatedTask) => {
                      setSelectedTask(updatedTask);
                      queryClient.invalidateQueries(['tasks']);
                    }}
                     onError={(message) => setSnackbar({ open: true, message, severity: 'error' })}
                  />
                  <PriorityChip value={selectedTask.priority_bucket} />
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
                {editMode ? (
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Description"
                    value={draft?.description ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                ) : (
                  <Typography variant="body1" sx={styles.dialogDescription}>
                    {selectedTask.description || "No description."}
                  </Typography>
                )}
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  Hierarchy
                </Typography>
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

                  <Box>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Subtasks
                    </Typography>
                    {subtree && subtree.length > 0 ? (
                      <>
                        <Box sx={{ mt: 0.5 }}>{renderTree(subtree)}</Box>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => {
                            openSubtaskForm(selectedTask);
                          }}
                          sx={{
                            mt: 1,
                            textTransform: "none",
                            borderColor: "#6A11CB",
                            color: "#6A11CB",
                            "&:hover": {
                              borderColor: "#4E54C8",
                              backgroundColor: "rgba(106,17,203,0.04)",
                            },
                          }}
                        >
                          Add Subtask
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          openSubtaskForm(selectedTask);
                        }}
                        sx={{
                          textTransform: "none",
                          borderColor: "#6A11CB",
                          color: "#6A11CB",
                          "&:hover": {
                            borderColor: "#4E54C8",
                            backgroundColor: "rgba(106,17,203,0.04)",
                          },
                        }}
                      >
                        Add Subtask
                      </Button>
                    )}
                  </Box>
                </Stack>
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
                    {editMode ? (
                      <TextField
                        fullWidth
                        size="small"
                        value={draft?.project ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, project: e.target.value }))}
                      />
                    ) : (
                      <Typography variant="body2" sx={styles.dialogInfoValue}>
                        {selectedTask.project || "—"}
                      </Typography>
                    )}

                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Due date
                    </Typography>
                    {editMode ? (
                      <TextField
                        type="date"
                        fullWidth
                        size="small"
                        value={draft?.due_date ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                        InputLabelProps={{ shrink: true }}
                      />
                    ) : (
                      <Typography variant="body2" sx={styles.dialogInfoValue}>
                        {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : "—"}
                      </Typography>
                    )}

                  </Box>
                </Stack>
              </Box>

              <Divider sx={styles.dialogDivider} />

              <Box sx={styles.dialogSection}>
                <Typography variant="overline" sx={styles.dialogSectionTitle}>
                  People
                </Typography>
                {/* Row 1: Owner and Assignee */}
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Owner
                    </Typography>
                    {editMode ? (
                      <FormControl fullWidth size="small">
                        <Select
                          value={draft?.owner_id ?? selectedTask.owner_id}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setDraft((d) => ({ ...d, owner_id: Number.isInteger(next) ? next : selectedTask.owner_id }));
                          }}
                          renderValue={(val) => usersById.get(Number(val))?.full_name || "—"}
                        >
                          {allowedUsers.map((u) => (
                            <MenuItem key={u.user_id} value={String(u.user_id)}>
                              <ListItemText primary={`${u.full_name} (${u.role})`} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Typography variant="body2" sx={styles.dialogInfoValue}>
                        {usersById.get(selectedTask.owner_id)?.full_name || "—"}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={styles.dialogInfoItem}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Assignee
                    </Typography>
                    {editMode ? (
                      <FormControl fullWidth size="small">
                        <Select
                          value={
                            draft?.assignee_id != null
                              ? String(draft.assignee_id)
                              : selectedTask.assignee_id != null
                              ? String(selectedTask.assignee_id)
                              : ""
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setDraft((d) => ({ ...d, assignee_id: null }));
                              return;
                            }
                            const next = Number(raw);
                            setDraft((d) => ({ ...d, assignee_id: Number.isInteger(next) ? next : null }));
                          }}
                          renderValue={(val) => {
                            if (val === "" || val == null) return "— None —";
                            return usersById.get(Number(val))?.full_name || "—";
                          }}
                        >
                          <MenuItem value="">
                            <ListItemText primary="— None —" />
                          </MenuItem>
                          {Array.from(usersById.values()).map((u) => (
                            <MenuItem key={u.user_id} value={String(u.user_id)}>
                              <ListItemText primary={`${u.full_name} (${u.role})`} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Typography variant="body2" sx={styles.dialogInfoValue}>
                        {selectedTask.assignee_id != null
                          ? usersById.get(selectedTask.assignee_id)?.full_name || "—"
                          : "—"}
                      </Typography>
                    )}
                  </Box>
                </Stack>

                {/* Row 2: Members */}
                <Stack direction="row" spacing={2} sx={styles.dialogInfoRow}>
                  <Box sx={{ ...styles.dialogInfoItem, flex: 1 }}>
                    <Typography variant="caption" sx={styles.dialogInfoLabel}>
                      Members
                    </Typography>
                    {editMode ? (
                      <FormControl fullWidth size="small">
                        <Select
                          multiple
                          value={(draft?.members_id ?? []).map((id) => String(id))}
                          onChange={(e) => {
                            const val = Array.isArray(e.target.value) ? e.target.value : [];
                            // Coerce to numbers and de-duplicate
                            const nextUniqueNumbers = Array.from(new Set(
                              val
                                .map((v) => Number(v))
                                .filter((n) => Number.isInteger(n))
                            ));
                            setDraft((d) => ({ ...d, members_id: nextUniqueNumbers }));
                          }}
                          renderValue={(selected) =>
                            (selected || [])
                              .map((id) => usersById.get(Number(id))?.full_name)
                              .filter(Boolean)
                              .join(", ") || "—"
                          }
                        >
                          {Array.from(usersById.values()).map((u) => (
                            <MenuItem key={u.user_id} value={String(u.user_id)}>
                              <Checkbox checked={(draft?.members_id || []).includes(u.user_id)} />
                              <ListItemText primary={`${u.full_name} (${u.role})`} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Typography variant="body2" sx={styles.dialogInfoValue}>
                        {(selectedTask.members_id || [])
                          .map((id) => usersById.get(id)?.full_name)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </Typography>
                    )}
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
                <ActivityLog taskId={selectedTask.task_id} actingUserId={actingUser?.user_id} />
              </Box>

              <Divider sx={styles.dialogDivider} />

            {/*Task Attachments Section */}
            <Box sx={styles.dialogSection}>
            <Typography variant="overline" sx={styles.dialogSectionTitle}>
              Attachments
            </Typography>
            <AttachmentManager 
              taskId={selectedTask.task_id} 
              actingUserId={actingUser?.user_id} 
            />
            </Box>

            </DialogContent>
            <DialogActions sx={{ justifyContent: "space-between", px:3}}>
              <Box sx={{ display: "flex", gap: 1 }}>
                {!editMode && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setDraft({
                        title: selectedTask.title || "",
                        description: selectedTask.description || "",
                        project: selectedTask.project || "",
                        due_date: selectedTask.due_date ? selectedTask.due_date.slice(0, 10) : "",
                        status: selectedTask.status,
                        members_id: Array.isArray(selectedTask.members_id) ? selectedTask.members_id : [],
                        owner_id: selectedTask.owner_id,
                            assignee_id: selectedTask.assignee_id ?? null,
                      });
                      setEditMode(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </Box>

              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                {editMode ? (
                  <>
                    <Button onClick={() => { setEditMode(false); setDraft(null); }}>
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => {
                        if (!actingUser) { showError("Select an acting user first."); return; }
                        const payload = {
                          title: draft.title,
                          description: draft.description,
                          project: draft.project,
                          due_date: draft.due_date || null, // allow clearing
                          owner_id: draft.owner_id,
                          assignee_id: draft.assignee_id ?? null,
                          // Backend will auto-set status to ONGOING if assignee is added and status omitted/UNASSIGNED
                          status: draft.assignee_id == null ? 'UNASSIGNED' : (draft.status ?? 'UNASSIGNED'),
                        };

                        // Include members_id ONLY if it actually changed (ignoring order and duplicates)
                        const nextMembers = Array.isArray(draft.members_id)
                          ? Array.from(new Set(draft.members_id))
                          : [];
                        const currentMembers = Array.isArray(selectedTask.members_id)
                          ? Array.from(new Set(selectedTask.members_id))
                          : [];
                        const sameMembers =
                          nextMembers.length === currentMembers.length &&
                          nextMembers.every((id) => currentMembers.includes(id));
                        if (!sameMembers) {
                          payload.members_id = nextMembers;
                        }

                        editMutation.mutate(payload);
                      }}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setSelectedTask(null)}>Close</Button>
                )}
                <DeleteButton 
                  task={selectedTask} 
                  actingUserId={selectedUserId}
                  onSuccess={(message) => {
                    setSnackbar({ open: true, message, severity: "success" });
                    setSelectedTask(null);
                    queryClient.invalidateQueries(['tasks']);
                  }}
                  onError={(error) => setSnackbar({ open: true, message: error, severity: "error" })}
                />
              </Box>
            </DialogActions>

          </>
        )}
      </Dialog>

      {/* Task Form Modal */}
      <TaskForm
        isOpen={isTaskFormOpen}
        onClose={() => {
          setIsTaskFormOpen(false);
          setSelectedTaskForSubtask(null);
        }}
        onSubmit={handleTaskCreated}
        parentTask={selectedTaskForSubtask}
        users={users}
        actingUserId={actingUser?.user_id}
      />

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

  taskCardAction: { 
    borderRadius: 2,
    alignItems: "flex-start",
  },
  taskCardContent: { 
    p: 2,
    "&:last-child": { pb: 2 },
  },

};
