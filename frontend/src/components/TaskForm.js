import React, { useState, useEffect } from 'react';
import './TaskForm.css';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	Stack,
	Box,
	Typography,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const TaskForm = ({ isOpen, onClose, onSubmit, parentTask, users, actingUserId }) => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'UNASSIGNED',
    priority_bucket: 5,
    due_date: '',
    project: parentTask?.project || '',
    owner_id: actingUserId || '',
    assignee_id: null,
    members_id: [],
    acting_user_id: actingUserId || ''
  });

  const [subtasks, setSubtasks] = useState([]);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const showError = (msg) => setSnackbar({ open: true, message: msg, severity: 'error' });
  const showSuccess = (msg) => setSnackbar({ open: true, message: msg, severity: 'success' });

// Member search states
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  useEffect(() => {
    if (parentTask) {
      setFormData(prev => ({
        ...prev,
        project: parentTask.project || '',
        owner_id: parentTask.owner_id || actingUserId || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        project: '',
        owner_id: actingUserId || '',
        priority_bucket: 5,
      }));
    }
  }, [parentTask, actingUserId]);

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      acting_user_id: actingUserId || ''
    }));
  }, [actingUserId]);

  // Add this useEffect after the existing useEffects:

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (!event.target.closest('.search-container')) {
            setShowMemberDropdown(false);
            setShowOwnerDropdown(false);
        }
    };

  if (showMemberDropdown || showOwnerDropdown) {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }
}, [showMemberDropdown, showOwnerDropdown]);

  // Get available members based on whether it's a task or subtask
  const getAvailableMembers = () => {
    if (parentTask) {
      // For subtasks: only parent task owner and current members
      const parentMemberIds = parentTask.members_id || [];
      const availableUserIds = [parentTask.owner_id, ...parentMemberIds];
      return users.filter(user => availableUserIds.includes(user.user_id));
    }
    // For main tasks: all users
    return users;
  };

  const availableMembers = getAvailableMembers();

  // Filter members based on search term
  const filteredMembers = availableMembers.filter(user =>
    user.user_id !== formData.owner_id && // Exclude current owner
    user.full_name.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(memberSearchTerm.toLowerCase())
  );

  // Filter users for owner selection (only for main tasks)
  const filteredOwners = users.filter(user =>
    user.full_name.toLowerCase().includes(ownerSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(ownerSearchTerm.toLowerCase())
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Validate due_date to not be in the past
    if (name === 'due_date' && value && value < today) {
      showError('Due date cannot be in the past');
      return;
    }

    // Enforce: cannot set status beyond UNASSIGNED unless assignee chosen
    if (name === 'status') {
      const wantsNonUnassigned = value !== 'UNASSIGNED';
      const hasAssignee = formData.assignee_id != null && formData.assignee_id !== '';
      if (wantsNonUnassigned && !hasAssignee) {
        showError('Choose an assignee before setting status beyond "Unassigned".');
        return;
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMemberSelect = (userId) => {
    if (formData.assignee_id == null || formData.assignee_id === '') {
      showError('Select an assignee before adding members.');
      return;
    }
    const currentMembers = formData.members_id || [];
    // Prevent selecting the owner as a member
    if (userId === formData.owner_id) {
        showError('The owner cannot be added as a member');
        return;
    }

    if (!currentMembers.includes(userId)) {
      setFormData(prev => ({
        ...prev,
        members_id: [...currentMembers, userId]
      }));
    }
    setMemberSearchTerm('');
    setShowMemberDropdown(false);
  };

  const handleMemberRemove = (userId) => {
    setFormData(prev => ({
      ...prev,
      members_id: prev.members_id.filter(id => id !== userId)
    }));
  };

  const handleOwnerSelect = (userId) => {
    setFormData(prev => ({
      ...prev,
      owner_id: userId,
      // Remove the new owner from members list if they're already a member
      members_id: prev.members_id.filter(id => id !== userId)
    }));
    setOwnerSearchTerm('');
    setShowOwnerDropdown(false);
  };

  const handleMembersChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => parseInt(option.value));
    setFormData(prev => ({
      ...prev,
      members_id: selectedOptions
    }));
  };

  const addSubtask = () => {
    const newSubtask = {
      id: Date.now(),
      title: '',
      description: '',
      status: 'UNASSIGNED',
      // No priority here; will inherit from parent/main task on creation
      due_date: '',
      owner_id: formData.owner_id
    };
    setSubtasks(prev => [...prev, newSubtask]);
    setShowSubtaskForm(true);
  };

  const updateSubtask = (id, field, value) => {
    // Validate due_date for subtasks too
    if (field === 'due_date' && value && value < today) {
      showError('Due date cannot be in the past');
      return;
    }

    setSubtasks(prev => prev.map(subtask => 
      subtask.id === id ? { ...subtask, [field]: value } : subtask
    ));
  };

  const removeSubtask = (id) => {
    setSubtasks(prev => prev.filter(subtask => subtask.id !== id));
  };

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setIsSubmitting(true);

    try {
      // Client-side validations
      if (!formData.title || !formData.title.trim()) {
        showError('Title is required.');
        setIsSubmitting(false);
        return;
      }
      if (!formData.owner_id) {
        showError('Owner is required.');
        setIsSubmitting(false);
        return;
      }
      if (!parentTask) {
        if (!(Number.isInteger(formData.priority_bucket) || /^\d+$/.test(String(formData.priority_bucket)))) {
          showError('Priority bucket must be 1–10.');
          setIsSubmitting(false);
          return;
        }
        const pb = parseInt(String(formData.priority_bucket), 10);
        if (pb < 1 || pb > 10) {
          showError('Priority bucket must be 1–10.');
          setIsSubmitting(false);
          return;
        }
      }
      if (!formData.due_date || String(formData.due_date).trim() === '') {
        showError('Due date is required.');
        setIsSubmitting(false);
        return;
      }
      if (formData.status !== 'UNASSIGNED' && (formData.assignee_id == null || formData.assignee_id === '')) {
        showError('Please select an assignee or set status to Unassigned.');
        setIsSubmitting(false);
        return;
      }
      // Create main task or subtask
      const endpoint = parentTask 
        ? `/tasks/${parentTask.task_id}/subtask`
        : '/tasks';
      
      // Build request payload explicitly to avoid JSON.stringify on functions
      let payload;
      if (parentTask) {
        const { title, description, status, due_date, owner_id, assignee_id, members_id, acting_user_id } = formData;
        payload = {
          title,
          description,
          status,
          due_date,
          owner_id,
          assignee_id,
          members_id,
          acting_user_id,
          parent_task_id: parentTask.task_id
        };
      } else {
        const { priority_bucket } = formData;
        payload = { ...formData, priority_bucket: parseInt(String(priority_bucket), 10), parent_task_id: null };
      }

      const taskResponse = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!taskResponse.ok) {
        const errorData = await taskResponse.json();
        throw new Error(errorData.error || 'Failed to create task');
      }

      const taskResult = await taskResponse.json();
      const createdTask = taskResult.data;

      // Create subtasks if any (only for main tasks, not subtasks)
      if (subtasks.length > 0 && !parentTask) {
        for (const subtask of subtasks) {
          if (subtask.title.trim()) {
            const subtaskResponse = await fetch(`${API_BASE}/tasks/${createdTask.task_id}/subtask`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                // inherit parent's project and priority; omit those fields intentionally
                title: subtask.title,
                description: subtask.description,
                status: subtask.status,
                due_date: subtask.due_date,
                owner_id: subtask.owner_id,
                assignee_id: null,
                members_id: [],
                acting_user_id: formData.acting_user_id
              }),
            });
            
            if (!subtaskResponse.ok) {
              console.warn('Failed to create subtask:', subtask.title);
            }
          }
        }
      }

      onSubmit && onSubmit(createdTask);
      onClose();
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        status: 'UNASSIGNED',
        priority_bucket: 5,
        due_date: '',
        project: '',
        owner_id: actingUserId || '',
        assignee_id: null,
        members_id: [],
        acting_user_id: actingUserId || ''
      });
      setSubtasks([]);
      setShowSubtaskForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
      showError(`Failed to create task: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOwner = users.find(user => user.user_id === formData.owner_id);
  const selectedMembers = formData.members_id.map(id => users.find(user => user.user_id === id)).filter(Boolean);
  const selectedAssignee = users.find(user => user.user_id === formData.assignee_id);

  // Available projects based on your seed data
  const availableProjects = [
    'Q3 Launch',
    'Alpha',
    'Marketing Campaign',
    'Finance Review', 
    'HR Training',
    'Operations',
    'Executive',
    'Security',
    'Business Development',
    'Planning',
    'Data Management',
    'Compliance',
    'Simple Projects'
  ];

  return (
    <>
    <Dialog
      open={Boolean(isOpen)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: dialogStyles.dialogPaper }}
    >
      <DialogTitle>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {parentTask ? `Add Subtask to "${parentTask.title}"` : 'Add New Task'}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
            fullWidth
            size="small"
          />

          <TextField
            label="Description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Enter task description"
            fullWidth
            multiline
            minRows={3}
            size="small"
          />

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
              >
                <MenuItem value="UNASSIGNED">Unassigned</MenuItem>
                <MenuItem value="ONGOING" disabled={!(formData.assignee_id != null && formData.assignee_id !== '')}>Ongoing</MenuItem>
                <MenuItem value="UNDER_REVIEW" disabled={!(formData.assignee_id != null && formData.assignee_id !== '')}>Under Review</MenuItem>
                <MenuItem value="COMPLETED" disabled={!(formData.assignee_id != null && formData.assignee_id !== '')}>Completed</MenuItem>
              </Select>
            </FormControl>

            {!parentTask && (
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  label="Priority"
                  name="priority_bucket"
                  value={formData.priority_bucket}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority_bucket: parseInt(e.target.value, 10) }))}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <MenuItem key={n} value={n}>{`P${n}`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <TextField
              type="date"
              label="Due Date"
              name="due_date"
              value={formData.due_date}
              onChange={handleInputChange}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: today }}
              size="small"
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Project"
              name="project"
              value={formData.project}
              onChange={handleInputChange}
              placeholder="Enter project name"
              size="small"
              sx={{ flex: 1, minWidth: 200 }}
            />
          </Stack>

          {!parentTask && (
            <Box>
              <Typography variant="caption" sx={dialogStyles.fieldLabel}>Owner</Typography>
              <div className="search-container">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search for owner..."
                  value={selectedOwner ? `${selectedOwner.full_name} (${selectedOwner.email})` : ownerSearchTerm}
                  onChange={(e) => {
                    setOwnerSearchTerm(e.target.value);
                    setShowOwnerDropdown(true);
                    if (selectedOwner && e.target.value !== `${selectedOwner.full_name} (${selectedOwner.email})`) {
                      setFormData(prev => ({ ...prev, owner_id: '' }));
                    }
                  }}
                  onFocus={() => setShowOwnerDropdown(true)}
                  required
                />
                {showOwnerDropdown && (
                  <div className="search-dropdown">
                    {filteredOwners.slice(0, 10).map(user => (
                      <div
                        key={user.user_id}
                        className="search-dropdown-item"
                        onClick={() => handleOwnerSelect(user.user_id)}
                      >
                        {user.full_name} ({user.email})
                      </div>
                    ))}
                    {filteredOwners.length === 0 && (
                      <div className="search-dropdown-item disabled">No users found</div>
                    )}
                  </div>
                )}
              </div>
            </Box>
          )}

          {/* Assignee (optional) */}
          <Box>
            <Typography variant="caption" sx={dialogStyles.fieldLabel}>Assignee (optional)</Typography>
            <FormControl size="small" fullWidth>
              <InputLabel>Assignee</InputLabel>
              <Select
                label="Assignee"
                value={formData.assignee_id != null && formData.assignee_id !== '' ? String(formData.assignee_id) : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setFormData(prev => ({ ...prev, assignee_id: null, members_id: [], status: 'UNASSIGNED' }));
                    return;
                  }
                  const next = parseInt(raw, 10);
                  setFormData(prev => ({ ...prev, assignee_id: Number.isInteger(next) ? next : null }));
                }}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {(parentTask ? availableMembers : users).map((u) => (
                  <MenuItem key={u.user_id} value={String(u.user_id)}>
                    {u.full_name} ({u.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedAssignee && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Assigned to: {selectedAssignee.full_name} ({selectedAssignee.email})
              </Typography>
            )}
          </Box>

          {parentTask && (
            <Box>
              <Typography variant="caption" sx={dialogStyles.fieldLabel}>Owner (Inherited from Parent Task)</Typography>
              <TextField
                fullWidth
                size="small"
                value={selectedOwner ? `${selectedOwner.full_name} (${selectedOwner.email})` : 'Loading...'}
                disabled
              />
            </Box>
          )}

          <Box>
            <Typography variant="caption" sx={dialogStyles.fieldLabel}>Members</Typography>
            <div className="search-container">
              <TextField
                fullWidth
                size="small"
                placeholder={`Search ${parentTask ? 'parent task' : 'organization'} members...`}
                value={memberSearchTerm}
                disabled={!(formData.assignee_id != null && formData.assignee_id !== '')}
                onChange={(e) => {
                  setMemberSearchTerm(e.target.value);
                  setShowMemberDropdown(true);
                }}
                onFocus={() => setShowMemberDropdown(true)}
              />
              {showMemberDropdown && (
                <div className="search-dropdown">
                  {filteredMembers.slice(0, 10).map(user => (
                    <div
                      key={user.user_id}
                      className={`search-dropdown-item ${formData.members_id.includes(user.user_id) ? 'selected' : ''} ${user.user_id === formData.owner_id ? 'disabled' : ''}`}
                      onClick={() => {
                        if (user.user_id !== formData.owner_id) {
                          handleMemberSelect(user.user_id);
                        }
                      }}
                    >
                      {user.full_name} ({user.email})
                      {user.user_id === formData.owner_id && <span className="owner-badge">Owner</span>}
                      {formData.members_id.includes(user.user_id) && <span className="checkmark">✓</span>}
                    </div>
                  ))}
                  {filteredMembers.length === 0 && (
                    <div className="search-dropdown-item disabled">
                      {parentTask ? 'No parent task members found' : 'No users found'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedMembers.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {selectedMembers.map(member => (
                  <Chip
                    key={member.user_id}
                    label={member.full_name}
                    onDelete={() => handleMemberRemove(member.user_id)}
                    size="small"
                  />
                ))}
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {parentTask ? 'Only parent task owner and members can be selected' : 'Search and select organization members'}
            </Typography>
          </Box>

          {!parentTask && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Subtasks</Typography>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addSubtask}
                  sx={{
                    textTransform: 'none',
                    borderColor: '#6A11CB',
                    color: '#6A11CB',
                    '&:hover': {
                      borderColor: '#4E54C8',
                      backgroundColor: 'rgba(106,17,203,0.04)'
                    }
                  }}
                >
                  Add Subtask
                </Button>
              </Stack>

              {subtasks.map((subtask) => (
                <Box key={subtask.id} sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, mb: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Subtask {subtasks.indexOf(subtask) + 1}</Typography>
                    <Button
                      type="button"
                      size="small"
                      color="error"
                      onClick={() => removeSubtask(subtask.id)}
                    >
                      Remove
                    </Button>
                  </Stack>

                  <Stack spacing={1.5}>
                    <TextField
                      placeholder="Subtask title"
                      value={subtask.title}
                      onChange={(e) => updateSubtask(subtask.id, 'title', e.target.value)}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      placeholder="Subtask description"
                      value={subtask.description}
                      onChange={(e) => updateSubtask(subtask.id, 'description', e.target.value)}
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                    />

                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                      <TextField
                        type="date"
                        label="Due Date"
                        value={subtask.due_date}
                        onChange={(e) => updateSubtask(subtask.id, 'due_date', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                        inputProps={{ min: today }}
                      />
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : (parentTask ? 'Create Subtask' : 'Create Task')}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
    <Snackbar
      open={snackbar.open}
      autoHideDuration={3000}
      onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={snackbar.severity}
        variant="filled"
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        sx={{ width: '100%' }}
      >
        {snackbar.message}
      </Alert>
    </Snackbar>
    </>
  );
};

const dialogStyles = {
	dialogPaper: {
		borderRadius: 3,
		boxShadow: '0 10px 30px rgba(16,24,40,0.15)'
	},
	fieldLabel: { color: 'text.secondary', display: 'block', marginBottom: 4 }
};

export default TaskForm;