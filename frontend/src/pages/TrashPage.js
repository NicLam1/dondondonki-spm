import "../App.css";
import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useQuery } from "@tanstack/react-query";
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

// Add these imports for sidebar icons
import DashboardIcon from "@mui/icons-material/Dashboard";
import TaskIcon from "@mui/icons-material/Task";
import FolderIcon from "@mui/icons-material/Folder";
import PersonIcon from "@mui/icons-material/Person";
import SettingsIcon from "@mui/icons-material/Settings";
import MailIcon from "@mui/icons-material/Mail";

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
  const color = value === "COMPLETED" ? "success" : value === "UNDER_REVIEW" ? "info" : value === "ONGOING" ? "warning" : "default";
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

function PriorityChip({ value }) {
  // Handle numeric priority buckets (1-10)
  if (typeof value === 'number') {
    const color = value <= 3 ? "error" : value <= 6 ? "warning" : "default";
    return <Chip label={`P${value}`} color={color} variant="outlined" size="small" />;
  }
  // Fallback for old text-based priorities
  const color = value === "HIGH" ? "error" : value === "MEDIUM" ? "warning" : "default";
  return <Chip label={value} color={color} variant="outlined" size="small" />;
}

export default function TrashPage() {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Get users for dropdown (same as TasksPage)
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchJson("/users"),
  });

  const users = usersData?.data || [];

  // Auto-select first user
  useEffect(() => {
    if (users.length && !selectedUserId) {
      setSelectedUserId(String(users[0].user_id));
    }
  }, [users, selectedUserId]);

  // Simple call to backend - backend handles ALL authority logic
  const { data: deletedTasksData, isLoading } = useQuery({
    queryKey: ["deleted-tasks", selectedUserId],
    queryFn: () => fetchJson("/tasks/deleted", {
      acting_user_id: selectedUserId,
    }),
    enabled: Boolean(selectedUserId),
  });

  const deletedTasks = deletedTasksData?.data || [];

  const handleRestoreTask = async (task) => {
    try {
      const response = await fetch(`${API_BASE}/tasks/${task.task_id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: parseInt(selectedUserId) })
      });

      if (!response.ok) {
        alert("Failed to restore task");
        return;
      }

      const result = await response.json();
      alert(result.message);
      window.location.reload();
    } catch (error) {
      alert("Failed to restore task");
    }
  };

  const sidebarItems = [
    { key: "dashboard", icon: <DashboardIcon />, label: "Dashboard" },
    { key: "tasks", icon: <TaskIcon />, label: "Tasks" },
    { key: "calendar", icon: <CalendarMonthIcon />, label: "Calendar" },
    { key: "projects", icon: <FolderIcon />, label: "Projects" },
    { key: "profile", icon: <PersonIcon />, label: "Profile" },
    { key: "settings", icon: <SettingsIcon />, label: "Settings" },
    { key: "messages", icon: <MailIcon />, label: "Messages", badge: 12 },
    { key: "trash", icon: <DeleteIcon />, label: "Trash", badge: deletedTasks.length > 0 ? deletedTasks.length : undefined },
  ];

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f6f7fb" }}>
      <Sidebar
        open={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((v) => !v)}
        items={sidebarItems}
        title="DonkiBoard"
      />

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        
        <Box sx={{ p: 3 }}>
          <Container maxWidth={false} disableGutters sx={{ px: 3 }}>
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 0.2, fontSize: "3em" }}>
                Trash
              </Typography>
            </Box>

            {/* User Selection Dropdown */}
            <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
              <FormControl sx={{ width: 280 }}>
                <InputLabel>Acting user</InputLabel>
                <Select
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
            </Box>

            {/* Deleted Tasks Display */}
            {isLoading ? (
              <Typography variant="body1">Loading deleted tasks…</Typography>
            ) : deletedTasks.length === 0 ? (
              <Paper sx={{ 
                p: 6, 
                textAlign: 'center', 
                borderRadius: 3, 
                bgcolor: 'background.paper', 
                border: '1px dashed #e0e0e0' 
              }}>
                <DeleteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1, color: 'text.secondary' }}>
                  Trash is empty
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  No deleted tasks found for this user
                </Typography>
              </Paper>
            ) : (
              <Stack spacing={2}>
                {deletedTasks.map((task) => (
                  <Card key={task.task_id} variant="outlined" sx={{ 
                    borderRadius: 2, 
                    borderColor: '#ffebee', 
                    bgcolor: '#fafafa',
                    '&:hover': { borderColor: '#ffcdd2' }
                  }}>
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" sx={{ 
                            color: 'text.secondary', 
                            textDecoration: 'line-through' 
                          }}>
                            {task.title}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <StatusChip value={task.status} />
                            <PriorityChip value={task.priority_bucket} />
                            <Typography variant="caption" color="text.secondary">
                              Deleted: {new Date(task.deleted_at).toLocaleDateString()}
                            </Typography>
                          </Stack>
                        </Box>
                        <Button
                          size="small"
                          startIcon={<RestoreIcon />}
                          onClick={() => handleRestoreTask(task)}
                        >
                          Restore
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
