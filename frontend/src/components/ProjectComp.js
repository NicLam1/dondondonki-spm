import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Paper,
  Breadcrumbs,
  Link,
  Divider,
  LinearProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Tooltip,
  Button,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  TextField
} from '@mui/material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderIcon from '@mui/icons-material/Folder';
import TaskIcon from '@mui/icons-material/Task';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddTaskIcon from '@mui/icons-material/AddTask';
import RemoveIcon from '@mui/icons-material/Remove';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ExportReportButton from './ExportReportButton';

// Add these imports for sidebar icons
import DashboardIcon from "@mui/icons-material/Dashboard";
import SettingsIcon from "@mui/icons-material/Settings";
import MailIcon from "@mui/icons-material/Mail";
import DeleteIcon from "@mui/icons-material/Delete";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";


const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const ProjectComp = () => {
  const { projectName } = useParams(); // This now contains project ID
  const [projectData, setProjectData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [availableTasks, setAvailableTasks] = useState([]);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  // assume current user id stored in localStorage or context
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const actingUserId = currentUser?.user_id || null;

  // Initialize acting user from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      const id = stored?.profile?.user_id ?? stored?.user_id ?? null;
      if (id) setSelectedUserId(String(id));
    } catch (_) {
      // ignore malformed localStorage
    }
  }, []);


  useEffect(() => {
    if (projectName && selectedUserId) {
      fetchProjectData();
    }
  }, [projectName, selectedUserId]);


  const fetchProjectData = async () => {
    try {
      setLoading(true);
     
      if (!selectedUserId) {
        console.error('❌ No acting user ID - user not logged in');
        setError('User not authenticated');
        return;
      }
     
      // Fetch users for displaying names
      const usersResponse = await fetch(`${API_BASE}/users`);
     
      if (usersResponse.ok) {
        const { data: usersData } = await usersResponse.json();
        setUsers(usersData || []);
      }
     
      // Parse project ID from URL parameter
      const projectId = parseInt(projectName, 10);
      
      if (!Number.isInteger(projectId)) {
        setError('Invalid project ID');
        return;
      }
     
      // FORCE fresh data with cache busting
      const timestamp = Date.now();
      const projectResponse = await fetch(`${API_BASE}/projects/${projectId}?acting_user_id=${selectedUserId}&_t=${timestamp}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
     
      if (!projectResponse.ok) {
        if (projectResponse.status === 404) {
          setError('Project not found');
        } else if (projectResponse.status === 403) {
          setError('You do not have permission to view this project');
        } else {
          setError('Failed to fetch project');
        }
        return;
      }
     
      const { data: project } = await projectResponse.json();
      
      console.log('🔍 Raw project data from API:', project);
     
      // Use related_tasks from the response (fetched via project_id relationship)
      const projectTasks = project.related_tasks || [];
      setTasks(projectTasks);
     
      // CRITICAL FIX: Calculate members first, then build project data
      const stats = calculateProjectStatsWithMembers(projectTasks, project);
      
      // Transform project data with calculated stats
      const finalProjectData = {
        id: project.project_id,
        name: project.name,
        description: project.description,
        endDate: project.end_date,
        ownerId: project.owner_id,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        tasksArray: project.tasks || [],
        storedMembers: project.members || [],
        ...stats
      };
      
      console.log('🔍 Final project data with stats:', finalProjectData);
      
      setProjectData(finalProjectData);
     
    } catch (err) {
      console.error('Error fetching project data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Calculate stats with proper member handling
  const calculateProjectStatsWithMembers = (tasks, projectFromApi) => {
    console.log('🧮 calculateProjectStatsWithMembers called with:', {
      tasksCount: tasks.length,
      projectOwner: projectFromApi.owner_id,
      projectMembers: projectFromApi.members
    });

    const stats = {
      totalTasks: tasks.length,
      completedTasks: 0,
      ongoingTasks: 0,
      unassignedTasks: 0,
      underReviewTasks: 0,
      priorities: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, P9: 0, P10: 0 },
      taskMembers: new Set(),
      allMembers: new Set(),
      recentTasks: [],
      upcomingDeadlines: []
    };

    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Process tasks
    tasks.forEach(task => {
      // Status counts
      switch (task.status) {
        case 'COMPLETED': stats.completedTasks++; break;
        case 'ONGOING': stats.ongoingTasks++; break;
        case 'UNASSIGNED': stats.unassignedTasks++; break;
        case 'UNDER_REVIEW': stats.underReviewTasks++; break;
      }

      // Priority counts
      if (task.priority_bucket && Number.isInteger(task.priority_bucket)) {
        const bucket = `P${task.priority_bucket}`;
        if (stats.priorities[bucket] !== undefined) {
          stats.priorities[bucket]++;
        }
      }

      // Collect task-derived members
      if (task.owner_id) stats.taskMembers.add(task.owner_id);
      if (task.assignee_id) stats.taskMembers.add(task.assignee_id);
      if (Array.isArray(task.members_id)) {
        task.members_id.forEach(id => stats.taskMembers.add(id));
      }

      // Recent tasks and deadlines logic
      const createdDate = new Date(task.created_at);
      if (now - createdDate <= 7 * 24 * 60 * 60 * 1000) {
        stats.recentTasks.push(task);
      }

      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        if (dueDate >= now && dueDate <= oneWeekFromNow) {
          stats.upcomingDeadlines.push(task);
        }
      }
    });

    // CRITICAL: Process members from the API data directly
    const storedMemberIds = Array.isArray(projectFromApi.members) ? projectFromApi.members : [];
    const ownerId = projectFromApi.owner_id;
    
    console.log('🔍 Member calculation inputs:', {
      storedMemberIds,
      ownerId,
      taskMembers: Array.from(stats.taskMembers)
    });

    // Add all stored members from DB (these include manual invites + task-derived + owner)
    storedMemberIds.forEach(id => {
      if (id !== null && id !== undefined) {
        stats.allMembers.add(id);
      }
    });

    // Always ensure owner is included (backup)
    if (ownerId) {
      stats.allMembers.add(ownerId);
    }

    console.log('🔍 Final member calculation:', {
      allMembers: Array.from(stats.allMembers),
      memberCount: stats.allMembers.size
    });

    // Keep backward compatibility
    stats.members = stats.allMembers;
    stats.memberCount = Math.max(1, stats.allMembers.size);

    stats.completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
    stats.recentTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    stats.upcomingDeadlines.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    return stats;
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.user_id === userId);
    return user ? user.full_name : 'Unknown User';
  };


  const getUserInitials = (userId) => {
    const user = users.find(u => u.user_id === userId);
    if (!user) return 'U';
    return user.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
  };


  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'ONGOING': return 'primary';
      case 'UNDER_REVIEW': return 'warning';
      case 'UNASSIGNED': return 'default';
      default: return 'default';
    }
  };


  const getPriorityColor = (priority) => {
    // Convert P1-P10 to color scheme similar to TasksPage
    const bucket = parseInt(priority.replace('P', ''));
    if (bucket <= 3) return 'error';    // P1-P3: High priority (red)
    if (bucket <= 7) return 'warning';  // P4-P7: Medium priority (orange)
    return 'info';                      // P8-P10: Low priority (blue)
  };


  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    return new Date(dateString).toLocaleDateString();
  };


  const handleTaskClick = (taskId) => {
    navigate(`/tasks?highlight=${taskId}`);
  };


  // Fetch users for invitation - FIXED
  const fetchAvailableUsers = async () => {
    if (!selectedUserId || !projectData) return;

    try {
      const response = await fetch(`${API_BASE}/users`);

      if (response.ok) {
        const { data: allUsers } = await response.json();
        // Filter out already added users and project owner - FIXED logic
        const currentMembers = projectData.storedMembers || [];
        const available = allUsers.filter(user => {
          const isAlreadyMember = currentMembers.includes(user.user_id);
          const isOwner = user.user_id === projectData.ownerId;
          return !isAlreadyMember && !isOwner;
        });
        console.log('🔍 Available users for invite:', {
          allUsers: allUsers.length,
          currentMembers,
          ownerId: projectData.ownerId,
          availableCount: available.length,
          available: available.map(u => ({ id: u.user_id, name: u.full_name }))
        });
        setAvailableUsers(available);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
      setAvailableUsers([]);
    }
  };

  // Add member - SIMPLIFIED to avoid double refresh
  const handleAddMember = async (userId) => {
    if (!projectData || !selectedUserId) return;

    console.log('🚀 Adding member:', { userId, projectId: projectData.id, actingUser: selectedUserId });

    try {
      const response = await fetch(`${API_BASE}/projects/${projectData.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(userId, 10),
          acting_user_id: parseInt(selectedUserId, 10)
        })
      });

      const result = await response.json();
      console.log('📡 Add member response:', { status: response.status, result });

      if (response.ok) {
        setSnackbar({
          open: true,
          message: result.message || 'Member added successfully',
          severity: 'success'
        });
        
        // IMMEDIATE close dialog to prevent double-clicks
        setShowInviteDialog(false);
        
        // SINGLE refresh only
        await fetchProjectData();
      } else {
        console.error('❌ Failed to add member:', result);
        setSnackbar({
          open: true,
          message: result.error || 'Failed to add member',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('❌ Network error adding member:', error);
      setSnackbar({
        open: true,
        message: 'Network error: Failed to add member',
        severity: 'error'
      });
    }
  };

  // Remove member - SIMPLIFIED to avoid double refresh
  const handleRemoveMember = async (userId) => {
    if (!projectData || !selectedUserId) return;

    console.log('🗑️ Removing member:', { userId, projectId: projectData.id, actingUser: selectedUserId });

    try {
      const response = await fetch(`${API_BASE}/projects/${projectData.id}/members/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acting_user_id: parseInt(selectedUserId, 10)
        })
      });

      const result = await response.json();
      console.log('📡 Remove member response:', { status: response.status, result });

      if (response.ok) {
        setSnackbar({
          open: true,
          message: result.message || 'Member removed successfully',
          severity: 'success'
        });
        
        // SINGLE refresh only
        await fetchProjectData();
      } else {
        console.error('❌ Failed to remove member:', result);
        
        // Check if this is a task involvement issue
        const errorMessage = result.error || 'Failed to remove member';
        let userFriendlyMessage = errorMessage;
        
        // If the member was re-added due to task involvement, show a helpful message
        if (errorMessage.includes('task') || result.message?.includes('task')) {
          const memberName = users.find(u => u.user_id === parseInt(userId))?.full_name || 'This user';
          userFriendlyMessage = `${memberName} cannot be removed because they are involved in project tasks. Remove them from tasks first.`;
        }
        
        setSnackbar({
          open: true,
          message: userFriendlyMessage,
          severity: 'warning'
        });
      }
    } catch (error) {
      console.error('❌ Network error removing member:', error);
      setSnackbar({
        open: true,
        message: 'Network error: Failed to remove member',
        severity: 'error'
      });
    }
  };

  const handleViewSchedule = (member) => {
    if (!member || !member.user_id) return;
    const params = new URLSearchParams();
    params.set('user_id', String(member.user_id));
    if (member.full_name) params.set('user_name', member.full_name);
    if (projectData?.id) params.set('project_id', String(projectData.id));
    const returnPath = location ? `${location.pathname}${location.search || ''}` : '';
    if (returnPath.startsWith('/')) params.set('return_to', returnPath);
    setShowMembersDialog(false);
    navigate(`/calendar?${params.toString()}`);
  };

  // Enhanced members list with simplified display - SIMPLIFIED with owner sorting
  const getMembersList = () => {
    if (!projectData?.allMembers || projectData.allMembers.size === 0) {
      console.log('⚠️ No members found in projectData:', projectData);
      return [];
    }
    
    console.log('🔍 getMembersList called with:', {
      allMembers: Array.from(projectData.allMembers),
      ownerId: projectData.ownerId,
      usersLoaded: users.length
    });
    
    const membersList = Array.from(projectData.allMembers).map(userId => {
      const user = users.find(u => u.user_id === userId);
      const isOwner = userId === projectData.ownerId;
      
      return {
        ...(user || { user_id: userId, full_name: 'Unknown User', role: 'Unknown' }),
        isOwner,
        canRemove: !isOwner && projectData.ownerId === parseInt(selectedUserId)
      };
    });
    
    // Sort so owner is always first
    return membersList.sort((a, b) => {
      if (a.isOwner && !b.isOwner) return -1; // Owner goes first
      if (!a.isOwner && b.isOwner) return 1;  // Owner goes first
      return 0; // Keep original order for non-owners
    });
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

  const canEdit = projectData && selectedUserId && (parseInt(selectedUserId, 10) === parseInt(projectData.ownerId, 10));

  const openEditDialog = () => {
    if (!projectData) return;
    setEditName(projectData.name || '');
    setEditDescription(projectData.description || '');
    // Convert to yyyy-mm-dd for input type=date
    const d = projectData.endDate ? new Date(projectData.endDate) : null;
    const yyyyMmDd = d ? new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';
    setEditEndDate(yyyyMmDd);
    setEditError('');
    setEditOpen(true);
  };

  const handleEditProject = async (e) => {
    e?.preventDefault?.();
    if (!projectData) return;
    if (!editName.trim()) { setEditError('Project name is required'); return; }
    try {
      setEditLoading(true);
      setEditError('');
      const response = await fetch(`${API_BASE}/projects/${projectData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription,
          end_date: editEndDate || null,
          acting_user_id: parseInt(selectedUserId, 10)
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update project (${response.status})`);
      }
      await response.json();
      setEditOpen(false);
      setSnackbar({ open: true, message: 'Project updated', severity: 'success' });
      fetchProjectData();
    } catch (err) {
      setEditError(err.message || 'Failed to update project');
    } finally {
      setEditLoading(false);
    }
  };


  // NEW: Fetch available tasks that can be added to this project
  const fetchAvailableTasks = async () => {
    if (!selectedUserId || !projectData) return;

    try {
      const response = await fetch(`${API_BASE}/tasks?acting_user_id=${selectedUserId}`);

      if (response.ok) {
        const { data: allTasks } = await response.json();
        // Filter tasks that are not already in this project
        const unassignedTasks = allTasks.filter(task => 
          task.project_id !== projectData.id && !task.is_deleted
        );
        setAvailableTasks(unassignedTasks);
      }
    } catch (error) {
      console.error('Error fetching available tasks:', error);
    }
  };

  // NEW: Add task to project
  const handleAddTask = async (taskId) => {
    if (!projectData || !selectedUserId) return;

    try {
      const response = await fetch(`${API_BASE}/projects/${projectData.id}/add-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          acting_user_id: parseInt(selectedUserId, 10)
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSnackbar({
          open: true,
          message: result.message || 'Task added to project successfully',
          severity: 'success'
        });
        // Refresh project data
        fetchProjectData();
        fetchAvailableTasks();
        setShowAddTaskDialog(false);
      } else {
        const errorData = await response.json();
        setSnackbar({
          open: true,
          message: errorData.error || 'Failed to add task to project',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error adding task to project:', error);
      setSnackbar({
        open: true,
        message: 'Failed to add task to project',
        severity: 'error'
      });
    }
  };

  // NEW: Remove task from project
  const handleRemoveTask = async (taskId) => {
    if (!projectData || !selectedUserId) return;

    try {
      const response = await fetch(`${API_BASE}/projects/${projectData.id}/remove-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          acting_user_id: parseInt(selectedUserId, 10)
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSnackbar({
          open: true,
          message: result.message || 'Task removed from project successfully',
          severity: 'success'
        });
        // Refresh project data
        fetchProjectData();
        fetchAvailableTasks();
      } else {
        const errorData = await response.json();
        setSnackbar({
          open: true,
          message: errorData.error || 'Failed to remove task from project',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error removing task from project:', error);
      setSnackbar({
        open: true,
        message: 'Failed to remove task from project',
        severity: 'error'
      });
    }
  };


  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }


  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">Error loading project: {error}</Alert>
      </Box>
    );
  }


  if (!projectData) {
    return (
      <Box p={3}>
        <Alert severity="warning">Project not found</Alert>
      </Box>
    );
  }


  // ensure you DO NOT call projectData as a function — use it as an object
  const proj = projectData; // safe alias if you prefer

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        items={sidebarItems}
        title="DonkiBoard"
      />
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />
        <Box sx={{ flexGrow: 1, p: 3 }}>
          {/* Header */}
          <Box mb={3}>
            <Box display="flex" alignItems="center" mb={2}>
              <IconButton onClick={() => navigate('/projects')} sx={{ mr: 1 }}>
                <ArrowBackIcon />
              </IconButton>
              <Breadcrumbs>
                <Link
                  component="button"
                  variant="body1"
                  onClick={() => navigate('/projects')}
                  sx={{ textDecoration: 'none' }}
                >
                  Projects
                </Link>
                <Typography variant="body1" color="text.primary">
                  {projectData?.name || 'Loading...'}
                </Typography>
              </Breadcrumbs>
            </Box>
           
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Box display="flex" alignItems="center">
                <FolderIcon sx={{ mr: 1, color: 'primary.main', fontSize: 32 }} />
                <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
                  {projectData?.name || 'Loading...'}
                </Typography>
              </Box>
              
              {/* Actions */}
              <Stack direction="row" spacing={1}>
                {canEdit && (
                  <>
                    <Button
                      variant="outlined"
                      onClick={openEditDialog}
                      size="small"
                    >
                      Edit Project
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        fetchAvailableUsers();
                        setShowInviteDialog(true);
                      }}
                      size="small"
                    >
                      Invite Members
                    </Button>
                  </>
                )}

                {/* Export button inline, matches style */}
                {proj && (
                  <ExportReportButton
                    scope="project"
                    id={projectData.project_id || projectData.id}
                    name={projectData.name || projectData.title} // <- pass project name
                    actingUserId={actingUserId}
                    label="Export Project"
                    variant="outlined"
                    size="small"
                  />
                )}

                <Button
                  variant="contained"
                  startIcon={<AddTaskIcon />}
                  onClick={() => {
                    fetchAvailableTasks();
                    setShowAddTaskDialog(true);
                  }}
                  disabled={!projectData}
                  size="small"
                >
                  Add Task
                </Button>
              </Stack>
            </Box
              >
             
            {projectData?.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {projectData.description}
              </Typography>
            )}
            
            {/* Add project due date display */}
            {projectData?.endDate && (
              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                <CalendarTodayIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                <Typography variant="body1" color="text.secondary">
                  Project Due: {formatDate(projectData.endDate)}
                </Typography>
                {/* Add overdue indicator if project is past due (only after the due date) */}
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const parts = String(projectData.endDate).split('-').map((n) => Number(n));
                  if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) return false;
                  const dueLocal = new Date(parts[0], parts[1] - 1, parts[2]);
                  return today > dueLocal;
                })() && (
                  <Chip 
                    label="OVERDUE" 
                    size="small" 
                    color="error" 
                    sx={{ ml: 1 }}
                  />
                )}
              </Box>
            )}
            
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body1" color="text.secondary">
                Project overview and task management
              </Typography>
            </Stack>
          </Box>


        {/* Stats Cards */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
                      {projectData.totalTasks}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Tasks
                    </Typography>
                  </Box>
                  <TaskIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
         
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => setShowMembersDialog(true)}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
                      {projectData.memberCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Team Members
                    </Typography>
                    <Typography variant="caption" color="primary.main">
                      Click to view
                    </Typography>
                  </Box>
                  <PersonIcon sx={{ fontSize: 40, color: 'info.main' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
         
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
                      {projectData.completionRate}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completion Rate
                    </Typography>
                  </Box>
                  <TrendingUpIcon sx={{ fontSize: 40, color: 'success.main' }} />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={projectData.completionRate}
                  sx={{ mt: 1, height: 6, borderRadius: 3 }}
                />
              </CardContent>
            </Card>
          </Grid>
         
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 700 }}>
                      {projectData.completedTasks}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completed
                    </Typography>
                  </Box>
                  <AssignmentTurnedInIcon sx={{ fontSize: 40, color: 'success.main' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>


        {/* Status Distribution and Priority Distribution */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Task Status Distribution</Typography>
                <Stack spacing={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label="Completed" color="success" size="small" />
                    <Typography variant="body2">{projectData.completedTasks}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label="Ongoing" color="primary" size="small" />
                    <Typography variant="body2">{projectData.ongoingTasks}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label="Under Review" color="warning" size="small" />
                    <Typography variant="body2">{projectData.underReviewTasks}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label="Unassigned" color="default" size="small" />
                    <Typography variant="body2">{projectData.unassignedTasks}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
         
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Priority Distribution</Typography>
                <Stack spacing={2}>
                  {Object.entries(projectData.priorities).map(([priority, count]) => (
                    <Box key={priority} display="flex" justifyContent="space-between" alignItems="center">
                      <Chip
                        label={priority}
                        color={getPriorityColor(priority)}
                        size="small"
                        variant="outlined"
                      />
                      <Typography variant="body2">{count}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>


        {/* Tasks Table with Remove option */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Project Tasks</Typography>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((task) => {
                    // Check if task is overdue (only day after due date counts as overdue)
                    const isOverdue = (() => {
                      if (!task.due_date || task.status === 'COMPLETED') return false;
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const parts = String(task.due_date).split('-').map((n) => Number(n));
                      if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) return false;
                      const dueLocal = new Date(parts[0], parts[1] - 1, parts[2]);
                      return today > dueLocal;
                    })();
                    
                    return (
                      <TableRow 
                        key={task.task_id} 
                        hover
                        sx={isOverdue ? { backgroundColor: '#ffebee', borderLeft: '4px solid #f44336' } : undefined}
                      >
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            fontWeight="medium" 
                            onClick={() => navigate(`/tasks?task=${task.task_id}`)}
                            sx={{ 
                              cursor: 'pointer', 
                              '&:hover': { textDecoration: 'underline', color: 'primary.main' },
                              ...(isOverdue ? { color: '#d32f2f' } : {})
                            }}
                          >
                            {task.title}
                            {isOverdue && <Chip label="OVERDUE" size="small" color="error" sx={{ ml: 1 }} />}
                          </Typography>
                          {task.description && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {task.description.length > 50
                                ? `${task.description.substring(0, 50)}...`
                                : task.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={task.status}
                            color={getStatusColor(task.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={task.priority_bucket ? `P${task.priority_bucket}` : 'P?'}
                            color={task.priority_bucket ? getPriorityColor(`P${task.priority_bucket}`) : 'default'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={getUserName(task.owner_id)}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                              {getUserInitials(task.owner_id)}
                            </Avatar>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {task.assignee_id ? (
                            <Tooltip title={getUserName(task.assignee_id)}>
                              <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                                {getUserInitials(task.assignee_id)}
                              </Avatar>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              Unassigned
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={isOverdue ? { color: '#d32f2f', fontWeight: 'bold' } : undefined}>
                            {formatDate(task.due_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<RemoveIcon />}
                            onClick={() => handleRemoveTask(task.task_id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
           
            {tasks.length === 0 && (
              <Box textAlign="center" py={4}>
                <Typography variant="body2" color="text.secondary">
                  No tasks found for this project
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Add Task Dialog */}
      <Dialog open={showAddTaskDialog} onClose={() => setShowAddTaskDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Task to Project</DialogTitle>
        <DialogContent>
          <List>
            {availableTasks.map((task) => (
              <ListItem key={task.task_id}>
                <ListItemText
                  primary={task.title}
                  secondary={`Owner: ${getUserName(task.owner_id)} | Priority: P${task.priority_bucket}`}
                />
                <Button
                  variant="outlined"
                  onClick={() => handleAddTask(task.task_id)}
                >
                  Add to Project
                </Button>
              </ListItem>
            ))}
            {availableTasks.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No available tasks to add
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTaskDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Invite Members Dialog */}
      <Dialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Invite Members to Project</DialogTitle>
        <DialogContent>
          {availableUsers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {users.length === 0 ? 'Loading users...' : 'No users available to invite'}
            </Typography>
          ) : (
            <List>
              {availableUsers.map((user) => (
                <ListItem key={user.user_id} sx={{ px: 0 }}>
                  <Avatar sx={{ mr: 2 }}>
                    {getUserInitials(user.user_id)}
                  </Avatar>
                  <ListItemText
                    primary={user.full_name}
                    secondary={`${user.role} | ${user.email || 'No email'}`}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleAddMember(user.user_id)}
                    size="small"
                  >
                    Invite
                  </Button>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInviteDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Enhanced Members Dialog with simplified display */}
      <Dialog 
        open={showMembersDialog} 
        onClose={() => setShowMembersDialog(false)} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <PersonIcon sx={{ mr: 1 }} />
            Project Members ({projectData?.memberCount || 0})
          </Box>
        </DialogTitle>
        <DialogContent>
          {getMembersList().length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No members found for this project
            </Typography>
          ) : (
            <List>
              {getMembersList().map((member, index) => (
                <ListItem key={member.user_id} divider={index < getMembersList().length - 1}>
                  <Avatar sx={{ mr: 2 }}>
                    {getUserInitials(member.user_id)}
                  </Avatar>
                  <ListItemText
                    primary={member.full_name}
                    secondary={`Role: ${member.role}`}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CalendarMonthIcon fontSize="inherit" />}
                      onClick={() => handleViewSchedule(member)}
                    >
                      View Schedule
                    </Button>
                    {member.isOwner ? (
                      <Chip 
                        label="Owner" 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                    ) : member.canRemove ? (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleRemoveMember(member.user_id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMembersDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={editOpen} onClose={() => (!editLoading && setEditOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Edit Project</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleEditProject} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              margin="dense"
              label="Project Name"
              fullWidth
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <TextField
              margin="dense"
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <TextField
              margin="dense"
              label="End Date"
              type="date"
              fullWidth
              value={editEndDate}
              onChange={(e) => setEditEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            {editError && (
              <Alert severity="error" sx={{ mt: 2 }}>{editError}</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editLoading}>Cancel</Button>
          <Button onClick={handleEditProject} variant="contained" disabled={editLoading}>
            {editLoading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
    </Box>
    
  );
};


export default ProjectComp;
