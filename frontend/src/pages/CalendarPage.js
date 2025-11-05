import "../App.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Container, IconButton, Paper, Tooltip, Typography } from "@mui/material";
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";
export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [deadlines, setDeadlines] = useState([]);
  const [loadingDeadlines, setLoadingDeadlines] = useState(false);
  const [deadlinesError, setDeadlinesError] = useState(null);
  const today = useMemo(() => new Date(), []);
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch (e) {
      return {};
    }
  }, []);
  const actingUserId = user?.user_id ?? user?.profile?.user_id ?? null;
  const calendarUserIdParam = searchParams.get("user_id");
  const calendarUserNameParam = searchParams.get("user_name") || "";
  const returnTo = searchParams.get("return_to") || "";
  const projectIdParam = searchParams.get("project_id");
  const calendarUserId = useMemo(() => {
    const parsed = calendarUserIdParam ? parseInt(calendarUserIdParam, 10) : NaN;
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return actingUserId || null;
  }, [calendarUserIdParam, actingUserId]);
  const isViewingSelf = !calendarUserId || calendarUserId === actingUserId;
  const safeReturnPath = useMemo(() => {
    if (typeof returnTo === "string" && returnTo.startsWith("/")) {
      return returnTo;
    }
    return null;
  }, [returnTo]);
  const formatCalendarTitle = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return "Member's Calendar";
    return trimmed.endsWith("s") ? `${trimmed}' Calendar` : `${trimmed}'s Calendar`;
  };
  const calendarOwnerName = isViewingSelf
    ? "My Calendar"
    : formatCalendarTitle(calendarUserNameParam || "Member");
  useEffect(() => {
    if (!actingUserId) {
      setDeadlines([]);
      setDeadlinesError("User information not found. Please sign in again.");
      return;
    }
    if (!calendarUserId) {
      setDeadlines([]);
      setDeadlinesError("Unable to determine which calendar to load.");
      return;
    }
    const controller = new AbortController();
    const loadDeadlines = async () => {
      setLoadingDeadlines(true);
      setDeadlinesError(null);
      try {
        const url = new URL(
          `${API_BASE}/tasks/by-user/${calendarUserId}/deadlines`
        );
        url.searchParams.set("acting_user_id", String(actingUserId));
        if (projectIdParam) {
          url.searchParams.set("project_id", projectIdParam);
        }
        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(json?.error || `HTTP ${response.status}`);
        }
        setDeadlines(Array.isArray(json?.data) ? json.data : []);
      } catch (error) {
        if (error.name === "AbortError") return;
        setDeadlinesError(error.message || "Failed to load deadlines.");
        setDeadlines([]);
      } finally {
        setLoadingDeadlines(false);
      }
    };
    loadDeadlines();
    return () => controller.abort();
  }, [actingUserId, calendarUserId, projectIdParam]);
  const daysOfWeek = useMemo(
    () => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    []
  );
  const formatTaskTitle = (title) => {
    if (!title) return "";
    const normalized = title.trim().replace(/\s+/g, " ");
    return normalized.length > 32 ? `${normalized.slice(0, 29)}…` : normalized;
  };
  const formatPriority = (priority) => {
    if (priority === null || priority === undefined) return "—";
    return `P${priority}`;
  };
  const formatRoles = (roles = []) => {
    if (!roles.length) return "—";
    return roles
      .map((role) => {
        if (role === "owner") return "Owner";
        if (role === "assignee") return "Assignee";
        if (role === "member") return "Member";
        return role;
      })
      .join(", ");
  };
  const deadlinesByDate = useMemo(() => {
    const map = new Map();
    deadlines.forEach((item) => {
      if (!item?.due_date) return;
      const dateKey = new Date(item.due_date).toISOString().slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(item);
    });
    return map;
  }, [deadlines]);
  const calendarDays = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(monthEnd);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    const days = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dayDate = new Date(cursor);
      const dateKey = dayDate.toISOString().slice(0, 10);
      days.push({
        date: dayDate,
        isCurrentMonth: dayDate.getMonth() === currentMonth.getMonth(),
        isToday:
          dayDate.getFullYear() === today.getFullYear() &&
          dayDate.getMonth() === today.getMonth() &&
          dayDate.getDate() === today.getDate(),
        tasks: deadlinesByDate.get(dateKey) || [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [currentMonth, today, deadlinesByDate]);
  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const handleResetToToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const monthLabel = currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
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
        onToggle={() => setIsSidebarOpen((value) => !value)}
        items={sidebarItems}
        title="DonkiBoard"
        onItemClick={(key) => {
          if (key === "tasks") {
            window.location.href = "/tasks";
          } else if (key === "trash") {
            window.location.href = "/trash";
          }
        }}
      />
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Topbar onMenuClick={() => setIsSidebarOpen((value) => !value)} />
        <Box sx={{ flexGrow: 1, py: 4 }}>
          <Container maxWidth="lg">
            <Box sx={styles.headerRow}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {calendarOwnerName}
              </Typography>
              {safeReturnPath && (
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => navigate(safeReturnPath)}
                  variant="text"
                  sx={{ ml: 2 }}
                >
                  Back to Project
                </Button>
              )}
            </Box>
            <Paper elevation={3} sx={styles.calendarCard}>
              <Box sx={styles.calendarHeader}>
                <IconButton color="primary" onClick={handlePrevMonth}>
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {monthLabel}
                </Typography>
                <IconButton color="primary" onClick={handleNextMonth}>
                  <ChevronRightIcon />
                </IconButton>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<TodayIcon />}
                  onClick={handleResetToToday}
                  sx={{ ml: "auto" }}
                >
                  Today
                </Button>
              </Box>
              <Box sx={styles.weekdayRow}>
                {daysOfWeek.map((day) => (
                  <Typography key={day} sx={styles.weekdayCell}>
                    {day}
                  </Typography>
                ))}
              </Box>
              <Box sx={styles.daysGrid}>
                {calendarDays.map(({ date, isCurrentMonth, isToday, tasks }) => (
                  <Paper
                    key={date.toISOString()}
                    elevation={0}
                    sx={{
                      ...styles.dayCell,
                      opacity: isCurrentMonth ? 1 : 0.45,
                      borderColor: isToday ? "primary.main" : "divider",
                      boxShadow: isToday ? "0 0 0 1px inset rgba(25, 118, 210, 0.35)" : "none",
                      backgroundColor: isToday ? "rgba(25, 118, 210, 0.08)" : "transparent",
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {date.getDate()}
                    </Typography>
                    <Box sx={styles.tasksList}>
                      {tasks.map((task) => (
                        <Tooltip
                          key={task.task_id}
                          arrow
                          placement="top"
                          title={
                            <Box sx={styles.tooltipContent}>
                              <Typography sx={styles.tooltipTitle}>{task.title}</Typography>
                              <Typography sx={styles.tooltipLine}>
                                Priority: {formatPriority(task.priority_bucket)}
                              </Typography>
                              <Typography sx={styles.tooltipLine}>
                                Role: {formatRoles(task.roles)}
                              </Typography>
                            </Box>
                          }
                        >
                          <Typography
                            variant="caption"
                            sx={styles.taskChip}
                          >
                            {formatTaskTitle(task.title)}
                          </Typography>
                        </Tooltip>
                      ))}
                      {!tasks.length && <Box sx={styles.noTaskPlaceholder} />}
                    </Box>
                  </Paper>
                ))}
              </Box>
              {deadlinesError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {deadlinesError}
                </Alert>
              )}
              {loadingDeadlines && !deadlinesError && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Loading deadlines…
                </Typography>
              )}
            </Paper>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
const styles = {
  calendarCard: {
    p: 2,
    borderRadius: 3,
    background: "white",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    flexWrap: "wrap",
    mb: 3,
  },
  calendarHeader: {
    display: "flex",
    alignItems: "center",
    gap: 1,
    mb: 2,
  },
  weekdayRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    textAlign: "center",
    mb: 1,
    color: "text.secondary",
    fontWeight: 600,
  },
  weekdayCell: {
    py: 1,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 1,
  },
  dayCell: {
    minHeight: 96,
    borderRadius: 2,
    border: "1px solid",
    borderColor: "divider",
    p: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  tasksList: {
    display: "flex",
    flexDirection: "column",
    gap: 0.5,
    width: "100%",
    overflow: "hidden",
  },
  taskChip: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "rgba(25,118,210,0.08)",
    color: "rgba(25,118,210,0.95)",
    borderRadius: 1,
    px: 0.75,
    py: 0.5,
    lineHeight: 1.2,
    typography: "caption",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    border: "1px solid rgba(25,118,210,0.15)",
    boxSizing: "border-box",
  },
  noTaskPlaceholder: {
    flexGrow: 1,
  },
  tooltipContent: {
    display: "flex",
    flexDirection: "column",
    gap: 0.5,
  },
  tooltipTitle: {
    fontWeight: 600,
    maxWidth: 240,
    wordBreak: "break-word",
  },
  tooltipLine: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
};
