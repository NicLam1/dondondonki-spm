import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import FolderIcon from '@mui/icons-material/Folder';
import TaskIcon from '@mui/icons-material/Task';
import PersonIcon from '@mui/icons-material/Person';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import DashboardIcon from "@mui/icons-material/Dashboard";
import SettingsIcon from "@mui/icons-material/Settings";
import MailIcon from "@mui/icons-material/Mail";
import DeleteIcon from "@mui/icons-material/Delete";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import RefreshIcon from '@mui/icons-material/Refresh';


const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";


const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");


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


  const fetchProjects = async () => {
    try {
      setLoading(true);
     
      if (!selectedUserId) {
        console.error('❌ No acting user ID - user not logged in');
        setError('User not authenticated');
        return;
      }
     
      console.log('🔄 Fetching projects for user:', selectedUserId);
     
      // Add cache-busting parameter to force fresh data
      const timestamp = Date.now();
      const response = await fetch(`${API_BASE}/projects?acting_user_id=${selectedUserId}&_t=${timestamp}`, {
        cache: 'no-cache' // Force fresh request
      });
     
      console.log('📡 Projects API response status:', response.status);
     
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Projects API error:', errorText);
        throw new Error(`Failed to fetch projects: ${response.status} ${errorText}`);
      }
     
      const responseData = await response.json();
      console.log('✅ Projects API full response:', responseData);
      
      const projectsData = responseData.data || [];
      
      // Projects now come with synchronized task arrays, but we still fetch details for stats
      if (projectsData && projectsData.length > 0) {
        const projectsWithStats = await Promise.all(
          projectsData.map(async (project) => {
            try {
              // Get project details which includes related_tasks via project_id relationship
              const detailResponse = await fetch(`${API_BASE}/projects/${project.project_id}?acting_user_id=${selectedUserId}`);
              
              if (detailResponse.ok) {
                const { data: projectDetail } = await detailResponse.json();
                const relatedTasks = projectDetail.related_tasks || [];
                
                // Calculate stats from related tasks
                const stats = calculateProjectStats(relatedTasks);
                
                return {
                  id: project.project_id,
                  name: project.name,
                  description: project.description,
                  endDate: project.end_date,
                  ownerId: project.owner_id,
                  createdAt: project.created_at,
                  updatedAt: project.updated_at,
                  tasksArray: project.tasks || [], // The synchronized tasks array
                  ...stats
                };
              } else {
                // Fallback using the tasks array from the project
                const taskCount = Array.isArray(project.tasks) ? project.tasks.length : 0;
                return {
                  id: project.project_id,
                  name: project.name,
                  description: project.description,
                  endDate: project.end_date,
                  ownerId: project.owner_id,
                  createdAt: project.created_at,
                  updatedAt: project.updated_at,
                  tasksArray: project.tasks || [],
                  taskCount,
                  completedCount: 0,
                  completionRate: 0,
                  memberCount: 1, // At least the owner
                  priorities: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, P9: 0, P10: 0 }
                };
              }
            } catch (error) {
              console.error(`❌ Error fetching details for project ${project.project_id}:`, error);
              return {
                id: project.project_id,
                name: project.name,
                description: project.description,
                endDate: project.end_date,
                ownerId: project.owner_id,
                createdAt: project.created_at,
                updatedAt: project.updated_at,
                tasksArray: project.tasks || [],
                taskCount: Array.isArray(project.tasks) ? project.tasks.length : 0,
                completedCount: 0,
                completionRate: 0,
                memberCount: 1,
                priorities: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, P9: 0, P10: 0 }
              };
            }
          })
        );
        
        // Sort by task count (highest first) then by creation date (newest first)
        projectsWithStats.sort((a, b) => {
          if (b.taskCount !== a.taskCount) {
            return b.taskCount - a.taskCount;
          }
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        setProjects(projectsWithStats);
      } else {
        setProjects([]);
      }
     
    } catch (err) {
      console.error('❌ Error in fetchProjects:', err);
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };


  const calculateProjectStats = (tasks) => {
    const stats = {
      taskCount: tasks.length,
      completedCount: 0,
      priorities: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, P9: 0, P10: 0 },
      members: new Set()
    };

    tasks.forEach(task => {
      if (task.status === 'COMPLETED') {
        stats.completedCount++;
      }

      // Priority counting using priority_bucket
      if (task.priority_bucket && Number.isInteger(task.priority_bucket)) {
        const bucket = `P${task.priority_bucket}`;
        if (stats.priorities[bucket] !== undefined) {
          stats.priorities[bucket]++;
        }
      }

      // Collect unique member IDs
      if (task.owner_id) {
        stats.members.add(task.owner_id);
      }
      if (task.assignee_id) {
        stats.members.add(task.assignee_id);
      }
      if (Array.isArray(task.members_id)) {
        task.members_id.forEach(id => stats.members.add(id));
      }
    });

    stats.memberCount = stats.members.size;
    stats.completionRate = stats.taskCount > 0 ? Math.round((stats.completedCount / stats.taskCount) * 100) : 0;

    return stats;
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchProjects();
    }
  }, [selectedUserId]);


  const handleProjectClick = (project) => {
    // Navigate using project ID for proper routing
    navigate(`/project/${project.id}`);
  };
  


  const getPriorityColor = (priority) => {
    // Convert P1-P10 to color scheme similar to TasksPage
    const bucket = parseInt(priority.replace('P', ''));
    if (bucket <= 3) return 'error';    // P1-P3: High priority (red)
    if (bucket <= 7) return 'warning';  // P4-P7: Medium priority (orange)
    return 'info';                      // P8-P10: Low priority (blue)
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


  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Clear any cached data and refetch
      await fetchProjects();
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenCreate = () => {
    setCreateError("");
    setCreateOpen(true);
  };

  const handleCloseCreate = () => {
    if (createLoading) return;
    setCreateOpen(false);
    setCreateName("");
    setCreateDescription("");
    setCreateEndDate("");
    setCreateError("");
  };

  const handleCreateProject = async (e) => {
    e?.preventDefault?.();
    setCreateError("");

    const name = createName.trim();
    const description = createDescription.trim();
    const endDate = createEndDate.trim();

    if (!name) {
      setCreateError("Project name is required");
      return;
    }
    if (!selectedUserId) {
      setCreateError("User not authenticated");
      return;
    }

    try {
      setCreateLoading(true);
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          end_date: endDate || undefined,
          owner_id: selectedUserId,
          acting_user_id: selectedUserId
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed to create project (${response.status})`);
      }

      const json = await response.json();
      const data = json?.data ?? json;
      const newId = data?.project_id ?? data?.id;
      if (!newId) {
        throw new Error("Project created but no ID returned");
      }

      // Optionally refresh list, but we navigate to detail
      setCreateLoading(false);
      handleCloseCreate();
      navigate(`/project/${newId}`);
    } catch (err) {
      console.error('❌ Create project error:', err);
      setCreateError(err.message || 'Failed to create project');
    } finally {
      setCreateLoading(false);
    }
  };


  if (loading) {
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
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <CircularProgress />
          </Box>
        </Box>
      </Box>
    );
  }


  if (error) {
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
            <Alert severity="error">Error loading projects: {error}</Alert>
          </Box>
        </Box>
      </Box>
    );
  }


  return (
    <>
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        items={sidebarItems}
        title="DonkiBoard"
      />
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} userId={selectedUserId} />
        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
                Projects
              </Typography>
              <Typography variant="body1" color="text.secondary">
                View all projects you're involved in and their progress
              </Typography>
            </Box>
            
            {/* Actions */}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleOpenCreate}
                size="small"
                disabled={!selectedUserId}
              >
                New Project
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={refreshing}
                size="small"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </Stack>
          </Box>


          {projects.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <FolderIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Projects Found
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You don't have access to any projects yet.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {projects.map((project) => (
                <Grid item xs={12} sm={6} md={4} key={project.id}>
                  <Card
                    sx={{
                      height: '100%',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 25px rgba(0,0,0,0.15)'
                      }
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleProjectClick(project)}
                      sx={{ height: '100%', p: 0 }}
                    >
                      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box display="flex" alignItems="center" mb={2}>
                          <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="h6" component="h2" noWrap sx={{ flex: 1 }}>
                            {project.name}
                          </Typography>
                        </Box>

                        {project.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {project.description.length > 100 
                              ? `${project.description.substring(0, 100)}...` 
                              : project.description
                            }
                          </Typography>
                        )}

                        <Stack spacing={2} sx={{ flex: 1 }}>
                          {/* Task Count */}
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center">
                              <TaskIcon sx={{ fontSize: 20, mr: 1, color: 'text.secondary' }} />
                              <Typography variant="body2" color="text.secondary">
                                Tasks
                              </Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="medium">
                              {project.taskCount}
                            </Typography>
                          </Box>


                          {/* Members Count */}
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box display="flex" alignItems="center">
                              <PersonIcon sx={{ fontSize: 20, mr: 1, color: 'text.secondary' }} />
                              <Typography variant="body2" color="text.secondary">
                                Members
                              </Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="medium">
                              {project.memberCount}
                            </Typography>
                          </Box>


                          {/* Completion Rate */}
                          <Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                              <Typography variant="body2" color="text.secondary">
                                Completion
                              </Typography>
                              <Typography variant="body2" fontWeight="medium">
                                {project.completionRate}%
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                width: '100%',
                                height: 6,
                                backgroundColor: 'grey.200',
                                borderRadius: 3,
                                overflow: 'hidden'
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${project.completionRate}%`,
                                  height: '100%',
                                  backgroundColor: project.completionRate === 100 ? 'success.main' : 'primary.main',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </Box>
                          </Box>


                          {/* Priority Distribution */}
                          <Box>
                            <Typography variant="body2" color="text.secondary" mb={1}>
                              Priority Distribution
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {Object.entries(project.priorities).map(([priority, count]) => (
                                count > 0 && (
                                  <Chip
                                    key={priority}
                                    label={`${priority}: ${count}`}
                                    size="small"
                                    color={getPriorityColor(priority)}
                                    variant="outlined"
                                  />
                                )
                              ))}
                            </Stack>
                          </Box>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Box>
    </Box>

    {/* Create Project Dialog */}
    <Dialog open={createOpen} onClose={handleCloseCreate} fullWidth maxWidth="sm">
      <DialogTitle>Create New Project</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleCreateProject} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            required
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
          />
          <TextField
            margin="dense"
            label="End Date"
            type="date"
            fullWidth
            value={createEndDate}
            onChange={(e) => setCreateEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {createError && (
            <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseCreate} disabled={createLoading}>Cancel</Button>
        <Button onClick={handleCreateProject} variant="contained" disabled={createLoading}>
          {createLoading ? 'Creating…' : 'Create Project'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};


export default ProjectsPage;
