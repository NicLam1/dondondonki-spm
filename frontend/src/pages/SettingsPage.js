import "../App.css";
import { useEffect, useMemo, useState } from "react";
import { Box, Container, Paper, Stack, Typography, Checkbox, FormControlLabel, FormGroup, Alert } from "@mui/material";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import DashboardIcon from "@mui/icons-material/Dashboard";
import TaskIcon from "@mui/icons-material/Task";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FolderIcon from "@mui/icons-material/Folder";
import PersonIcon from "@mui/icons-material/Person";
import SettingsIcon from "@mui/icons-material/Settings";
import MailIcon from "@mui/icons-material/Mail";
import DeleteIcon from "@mui/icons-material/Delete";

export default function SettingsPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [notificationPrefs, setNotificationPrefs] = useState({ inApp: true, email: true });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");

  const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";
  const actingUserId = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed?.profile?.user_id ?? parsed?.user_id ?? null;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    let abort = false;
    const load = async () => {
      if (!actingUserId) {
        setLoadingPrefs(false);
        setLoadError("User not found. Please sign in again.");
        return;
      }
      setLoadingPrefs(true);
      setLoadError("");
      try {
        const url = new URL(`${API_BASE}/notification-prefs`);
        url.searchParams.set("user_id", String(actingUserId));
        const response = await fetch(url.toString(), { credentials: "include" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || `HTTP ${response.status}`);
        if (!abort && json?.data) {
          setNotificationPrefs({ inApp: !!json.data.in_app, email: !!json.data.email });
        }
      } catch (e) {
        if (!abort) setLoadError(e?.message || "Failed to load preferences");
      } finally {
        if (!abort) setLoadingPrefs(false);
      }
    };
    load();
    return () => { abort = true; };
  }, [API_BASE, actingUserId]);

  const savePrefs = async (next) => {
    if (!actingUserId) return;
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE}/notification-prefs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: actingUserId, in_app: next.inApp, email: next.email }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || `HTTP ${response.status}`);
    } catch (e) {
      setSaveError(e?.message || "Failed to save preferences");
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
    { key: "trash", icon: <DeleteIcon />, label: "Trash" },
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
        <Topbar onMenuClick={() => setIsSidebarOpen((v) => !v)} />
        <Box sx={{ flexGrow: 1, py: 4 }}>
          <Container maxWidth="lg">
            <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Settings
              </Typography>
            </Box>

            <Stack spacing={2}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid #e5e7eb", background: "white" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Profile
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage your personal information and account details. (Coming soon)
                </Typography>
              </Paper>

              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid #e5e7eb", background: "white" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Notifications
                </Typography>
                {loadError && (
                  <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>
                )}
                {saveError && (
                  <Alert severity="warning" sx={{ mb: 2 }}>{saveError}</Alert>
                )}
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={notificationPrefs.inApp}
                        onChange={(e) => {
                          const next = { ...notificationPrefs, inApp: e.target.checked };
                          setNotificationPrefs(next);
                          savePrefs(next);
                        }}
                        disabled={loadingPrefs}
                      />
                    }
                    label="In-app"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={notificationPrefs.email}
                        onChange={(e) => {
                          const next = { ...notificationPrefs, email: e.target.checked };
                          setNotificationPrefs(next);
                          savePrefs(next);
                        }}
                        disabled={loadingPrefs}
                      />
                    }
                    label="Email"
                  />
                </FormGroup>
              </Paper>

              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid #e5e7eb", background: "white" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Preferences
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Theme, language, and other preferences. (Coming soon)
                </Typography>
              </Paper>
            </Stack>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}


