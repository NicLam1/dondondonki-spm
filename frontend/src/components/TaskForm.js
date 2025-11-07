import React, { useState, useEffect, useRef } from 'react';
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

// Add this after your imports and before the TaskForm component
async function apiJson(path, { method = "GET", params, body } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.keys(params).forEach(key => {
      if (params[key] != null) url.searchParams.append(key, params[key]);
    });
  }

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result;
}

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
    acting_user_id: actingUserId || '',
    // NEW: Recurrence fields
    is_recurring: false,
    recurrence_type: 'daily',
    recurrence_interval: 1,
    recurrence_end_date: ''
  });

// Add these handlers
const handleRecurrenceToggle = (e) => {
  const isRecurring = e.target.checked;
  setFormData(prev => ({
    ...prev,
    is_recurring: isRecurring,
    recurrence_type: isRecurring ? 'daily' : null,
    recurrence_interval: isRecurring ? 1 : null,
    recurrence_end_date: isRecurring ? '' : null
  }));
};

const handleRecurrenceChange = (field, value) => {
  setFormData(prev => ({
    ...prev,
    [field]: value
  }));
};

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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef(null);

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
      // For subtasks: only parent task owner and current members (keep existing restriction)
      const parentMemberIds = parentTask.members_id || [];
      const availableUserIds = [parentTask.owner_id, ...parentMemberIds];
      return users.filter(user => availableUserIds.includes(user.user_id));
    }
    // For main tasks: ALL users (no team/department filtering)
    return users;
  };

  const availableMembers = getAvailableMembers();

  // Filter members based on search term and exclude owner/assignee
  const filteredMembers = availableMembers.filter(user =>
    user.user_id !== formData.owner_id &&
    user.user_id !== formData.assignee_id &&
    (
      user.full_name.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(memberSearchTerm.toLowerCase())
    )
  );

  // Filter users for owner selection (only for main tasks)
  const filteredOwners = users.filter(user =>
    user.full_name.toLowerCase().includes(ownerSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(ownerSearchTerm.toLowerCase())
  );

  // Filter users for assignee selection based on access level and hierarchy
  const getAvailableAssignees = () => {
    const actingUser = users.find(u => u.user_id === actingUserId);
    if (!actingUser) return [];

    // Staff (level 0) cannot assign anyone
    if (actingUser.access_level === 0) {
      return [];
    }

    // Manager (level 1) can assign to: self OR staff in their team
    if (actingUser.access_level === 1) {
      return users.filter(u => 
        u.user_id === actingUser.user_id || // self
        (u.access_level === 0 && u.team_id === actingUser.team_id && actingUser.team_id !== null) // staff in same team
      );
    }

    // Director (level 2) can assign to: self OR staff/managers in their department
    if (actingUser.access_level === 2) {
      return users.filter(u => 
        u.user_id === actingUser.user_id || // self
        (u.access_level < 2 && u.department_id === actingUser.department_id && actingUser.department_id !== null) // staff/managers in same department
      );
    }

    // HR (level 3) can assign to anyone
    if (actingUser.access_level === 3) {
      return users;
    }

    return [];
  };

  const availableAssignees = getAvailableAssignees();

  // Get acting user to check access level
  const actingUser = users.find(u => u.user_id === actingUserId);
  const isStaff = actingUser && actingUser.access_level === 0;

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
    const currentMembers = formData.members_id || [];
    // Prevent selecting the owner or assignee as a member
    if (userId === formData.owner_id) {
      showError('The owner cannot be added as a member');
      return;
    }
    if (userId === formData.assignee_id) {
      showError('The assignee cannot be added as a member');
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

// const addSubtask = () => {
//   const newSubtask = {
//     id: Date.now(),
//     title: '',
//     description: '',
//     status: 'UNASSIGNED',
//     due_date: '',
//     owner_id: formData.owner_id,
//     assignee_id: null,
//     members_id: [],
//     priority_bucket: formData.priority_bucket
//   };
//   setSubtasks(prev => [...prev, newSubtask]);
// };

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

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files);
  console.log('Files selected:', files);
  
  const validFiles = files.filter(file => {
    // Max 50MB per file
    if (file.size > 50 * 1024 * 1024) {
      showError(`File "${file.name}" is too large. Maximum size is 50MB.`);
      return false;
    }
    return true;
  });
  
  setSelectedFiles(prev => [...prev, ...validFiles]);
};

const removeFile = (index) => {
  setSelectedFiles(prev => prev.filter((_, i) => i !== index));
};

// Update the handleSubmit function to upload attachments after task creation:
// const handleSubmit = async (e) => {
//   e.preventDefault();
//   setIsSubmitting(true);

//   try {
  
//         // Validate required fields
//     if (!formData.title.trim()) {
//       throw new Error('Title is required');
//     }
//     if (!formData.due_date || formData.due_date.trim() === '') {
//       throw new Error('Due date is required');
//     }
    
//     // Validate recurrence fields
//     if (formData.is_recurring) {
//       if (!formData.due_date || formData.due_date.trim() === '') {
//         throw new Error('Due date is required for recurring tasks');
//       }
//       if (formData.recurrence_end_date && formData.recurrence_end_date.trim() !== '' && formData.recurrence_end_date <= formData.due_date) {
//         throw new Error('Recurrence end date must be after due date');
//       }
//     }

//     // STEP 1: Create the task first and WAIT for completion
//     console.log('🚀 Creating task with data:', formData);

//     // Clean the form data before sending
//     const cleanedFormData = {
//       ...formData,
//       // Ensure empty strings become null for optional date fields
//       recurrence_end_date: formData.recurrence_end_date && formData.recurrence_end_date.trim() !== '' 
//         ? formData.recurrence_end_date 
//         : null
//     };
    
//     const endpoint = parentTask 
//       ? `/tasks/${parentTask.task_id}/subtask`
//       : '/tasks';
    
//     const taskResponse = await apiJson(endpoint, {
//       method: 'POST',
//       body: {
//         ...formData,
//         parent_task_id: parentTask?.task_id || null
//       }
//     });

//     if (!taskResponse.success) {
//       throw new Error(taskResponse.error || 'Failed to create task');
//     }

//     const createdTask = taskResponse.data;
//     console.log('✅ Task created successfully:', {
//       taskId: createdTask.task_id,
//       title: createdTask.title
//     });

//     // STEP 2: Only proceed with attachments if task creation was successful
//     if (selectedFiles.length > 0 && !parentTask) {
//       console.log(`📎 Starting upload of ${selectedFiles.length} files for task ${createdTask.task_id}`);
      
//       const uploadResults = [];
      
//       // Upload files sequentially to avoid overwhelming the server
//       for (let i = 0; i < selectedFiles.length; i++) {
//         const file = selectedFiles[i];
//         console.log(`📤 Uploading file ${i + 1}/${selectedFiles.length}: ${file.name}`);
        
//         try {
//           const uploadFormData = new FormData();
//           uploadFormData.append('file', file);
//           uploadFormData.append('acting_user_id', actingUserId.toString());

//           // Wait for each upload to complete before starting the next
//           const uploadResponse = await fetch(`${API_BASE}/tasks/${createdTask.task_id}/attachments`, {
//             method: 'POST',
//             credentials: 'include',
//             body: uploadFormData
//           });

//           const uploadResult = await uploadResponse.json();
          
//           if (uploadResult.success) {
//             console.log(`✅ File uploaded successfully: ${file.name}`);
//             uploadResults.push({ file: file.name, success: true });
//           } else {
//             console.error(`❌ Failed to upload ${file.name}:`, uploadResult.error);
//             uploadResults.push({ file: file.name, success: false, error: uploadResult.error });
//             showError(`Failed to upload ${file.name}: ${uploadResult.error}`);
//           }
//         } catch (uploadError) {
//           console.error(`❌ Upload error for ${file.name}:`, uploadError);
//           uploadResults.push({ file: file.name, success: false, error: uploadError.message });
//           showError(`Failed to upload ${file.name}: ${uploadError.message}`);
//         }
//       }
      
//       // Summary of upload results
//       const successfulUploads = uploadResults.filter(r => r.success).length;
//       const failedUploads = uploadResults.filter(r => !r.success).length;
      
//       console.log(`📊 Upload summary: ${successfulUploads} successful, ${failedUploads} failed`);
      
//       if (successfulUploads > 0) {
//         showSuccess(`Task "${createdTask.title}" created with ${successfulUploads} attachment(s)!`);
//       }
//     }

//     // STEP 3: Create subtasks if any (only for main tasks, not subtasks)
//     if (subtasks.length > 0 && !parentTask) {
//       console.log(`📋 Creating ${subtasks.length} subtasks...`);
      
//       for (const subtask of subtasks) {
//         if (subtask.title.trim()) {
//           try {
//             await apiJson(`/tasks/${createdTask.task_id}/subtask`, {
//               method: 'POST',
//               body: {
//                 ...subtask,
//                 acting_user_id: formData.acting_user_id,
//                 owner_id: formData.owner_id
//               }
//             });
//             console.log(`✅ Subtask created: ${subtask.title}`);
//           } catch (subtaskError) {
//             console.warn(`❌ Failed to create subtask: ${subtask.title}`, subtaskError);
//           }
//         }
//       }
//     }

//     // STEP 4: Success - close form and notify parent
//     console.log('🎉 Task creation process completed successfully');
//     onSubmit && onSubmit(createdTask);
//     onClose();
    
//     // Reset form
//     setFormData({
//       title: '',
//       description: '',
//       status: 'UNASSIGNED',
//       priority_bucket: 5,
//       due_date: '',
//       project: '',
//       owner_id: actingUserId || '',
//       assignee_id: null,
//       members_id: [],
//       acting_user_id: actingUserId || '',
//       // NEW: Reset recurrence fields
//       is_recurring: false,
//       recurrence_type: 'daily',
//       recurrence_interval: 1,
//       recurrence_end_date: ''
//     });
//     setSubtasks([]);
//     setSelectedFiles([]);
//     setShowSubtaskForm(false);

//     // Show final success message if no attachments were uploaded
//     if (selectedFiles.length === 0) {
//       showSuccess(`Task "${createdTask.title}" created successfully!`);
//     }

//   } catch (error) {
//     console.error('❌ Error in task creation process:', error);
//     showError(`Failed to create task: ${error.message}`);
//   } finally {
//     setIsSubmitting(false);
//   }
// };

const handleSubmit = async (e) => {
  e.preventDefault();
  setIsSubmitting(true);

  try {
    // Validate required fields
    if (!formData.title.trim()) {
      throw new Error('Title is required');
    }
    if (!formData.due_date || formData.due_date.trim() === '') {
      throw new Error('Due date is required');
    }

    // ✅ VALIDATE SUBTASKS
    for (const subtask of subtasks) {
      if (subtask.title.trim() && !subtask.due_date) {
        throw new Error(`Due date is required for subtask: "${subtask.title}"`);
      }
      if (!subtask.title.trim()) {
        throw new Error('All subtasks must have a title');
      }
    }
    
    // Validate recurrence fields
    if (formData.is_recurring) {
      if (!formData.due_date || formData.due_date.trim() === '') {
        throw new Error('Due date is required for recurring tasks');
      }
      if (formData.recurrence_end_date && formData.recurrence_end_date.trim() !== '' && formData.recurrence_end_date <= formData.due_date) {
        throw new Error('Recurrence end date must be after due date');
      }
    }

    console.log('🚀 Creating task with data:', formData);

    // Clean the form data before sending
    const cleanedFormData = {
      ...formData,
      recurrence_end_date: formData.recurrence_end_date && formData.recurrence_end_date.trim() !== '' 
        ? formData.recurrence_end_date 
        : null
    };
    
    const endpoint = parentTask 
      ? `/tasks/${parentTask.task_id}/subtask`
      : '/tasks';
    
    const taskResponse = await apiJson(endpoint, {
      method: 'POST',
      body: {
        ...cleanedFormData,
        parent_task_id: parentTask?.task_id || null
      }
    });

    if (!taskResponse.success) {
      throw new Error(taskResponse.error || 'Failed to create task');
    }

    const createdTask = taskResponse.data;
    console.log('✅ Task created successfully:', {
      taskId: createdTask.task_id,
      title: createdTask.title
    });

    // STEP 2: Upload attachments (only for main tasks)
    if (selectedFiles.length > 0 && !parentTask) {
      console.log(`📎 Starting upload of ${selectedFiles.length} files for task ${createdTask.task_id}`);
      
      const uploadResults = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        console.log(`📤 Uploading file ${i + 1}/${selectedFiles.length}: ${file.name}`);
        
        try {
          const uploadFormData = new FormData();
          uploadFormData.append('file', file);
          uploadFormData.append('acting_user_id', actingUserId.toString());

          const uploadResponse = await fetch(`${API_BASE}/tasks/${createdTask.task_id}/attachments`, {
            method: 'POST',
            body: uploadFormData
          });

          const uploadResult = await uploadResponse.json();
          
          if (uploadResult.success) {
            console.log(`✅ File uploaded successfully: ${file.name}`);
            uploadResults.push({ file: file.name, success: true });
          } else {
            console.error(`❌ Failed to upload ${file.name}:`, uploadResult.error);
            uploadResults.push({ file: file.name, success: false, error: uploadResult.error });
            showError(`Failed to upload ${file.name}: ${uploadResult.error}`);
          }
        } catch (uploadError) {
          console.error(`❌ Upload error for ${file.name}:`, uploadError);
          uploadResults.push({ file: file.name, success: false, error: uploadError.message });
          showError(`Failed to upload ${file.name}: ${uploadError.message}`);
        }
      }
      
      const successfulUploads = uploadResults.filter(r => r.success).length;
      
      if (successfulUploads > 0) {
        showSuccess(`Task "${createdTask.title}" created with ${successfulUploads} attachment(s)!`);
      }
    }

    // STEP 3: Create subtasks (only for main tasks)
    if (subtasks.length > 0 && !parentTask) {
      console.log(`📋 Creating ${subtasks.length} subtasks...`);
      
      for (const subtask of subtasks) {
        if (subtask.title.trim()) {
          try {
            // If subtask already has a task_id, it was created via the subtask dialog
            if (subtask.task_id && subtask.task_id !== 'temp') {
              // Update the parent_task_id for the existing subtask
              await apiJson(`/tasks/${subtask.task_id}`, {
                method: 'PATCH',
                params: { acting_user_id: String(actingUserId) },
                body: { parent_task_id: createdTask.task_id }
              });
              console.log(`✅ Updated subtask parent: ${subtask.title}`);
            } else {
              // Create new subtask using the old method (shouldn't happen with new approach)
              await apiJson(`/tasks/${createdTask.task_id}/subtask`, {
                method: 'POST',
                body: {
                  ...subtask,
                  acting_user_id: formData.acting_user_id,
                  owner_id: formData.owner_id
                }
              });
              console.log(`✅ Subtask created: ${subtask.title}`);
            }
          } catch (subtaskError) {
            console.warn(`❌ Failed to handle subtask: ${subtask.title}`, subtaskError);
          }
        }
      }
    }

    // SUCCESS: Close form and notify parent
    console.log('🎉 Task creation process completed successfully');
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
      acting_user_id: actingUserId || '',
      is_recurring: false,
      recurrence_type: 'daily',
      recurrence_interval: 1,
      recurrence_end_date: ''
    });
    setSubtasks([]);
    setSelectedFiles([]);

    // Show final success message if no attachments were uploaded
    if (selectedFiles.length === 0) {
      showSuccess(`Task "${createdTask.title}" created successfully!`);
    }

  } catch (error) {
    console.error('❌ Error in task creation process:', error);
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

          {/* Owner - Read-only, always set to logged-in user */}
          {!parentTask && (
            <Box>
              <Typography variant="caption" sx={dialogStyles.fieldLabel}>Owner</Typography>
              <TextField
                fullWidth
                size="small"
                value={selectedOwner ? `${selectedOwner.full_name} (${selectedOwner.email})` : 'Loading...'}
                disabled
                InputProps={{
                  readOnly: true,
                }}
                sx={{ 
                  backgroundColor: '#f5f5f5',
                  '& .MuiInputBase-input.Mui-disabled': {
                    WebkitTextFillColor: '#000000',
                    color: '#000000'
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                You are the owner of this task
              </Typography>
            </Box>
          )}

      {/* Recurrence Section */}
{!parentTask && (
  <Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
      Recurrence
    </Typography>
    
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <input
        type="checkbox"
        id="recurring-checkbox"
        checked={formData.is_recurring}
        onChange={handleRecurrenceToggle}
        style={{ marginRight: '8px' }}
      />
      <label htmlFor="recurring-checkbox">
        Make this a recurring task
      </label>
    </Box>
    
    {formData.is_recurring && (
      <Box sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, backgroundColor: '#f9f9f9' }}>
        <Stack spacing={2}>
          <FormControl size="small" fullWidth>
            <InputLabel>Repeat</InputLabel>
            <Select
              value={formData.recurrence_type}
              label="Repeat"
              onChange={(e) => handleRecurrenceChange('recurrence_type', e.target.value)}
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>
          
          {formData.recurrence_type === 'custom' && (
            <TextField
              label="Every X days"
              type="number"
              size="small"
              value={formData.recurrence_interval}
              onChange={(e) => handleRecurrenceChange('recurrence_interval', parseInt(e.target.value, 10) || 1)}
              inputProps={{ min: 1, max: 365 }}
              helperText="How many days between repetitions"
            />
          )}
          
          {(formData.recurrence_type === 'weekly' || formData.recurrence_type === 'monthly') && (
            <TextField
              label={`Every X ${formData.recurrence_type === 'weekly' ? 'weeks' : 'months'}`}
              type="number"
              size="small"
              value={formData.recurrence_interval}
              onChange={(e) => handleRecurrenceChange('recurrence_interval', parseInt(e.target.value, 10) || 1)}
              inputProps={{ min: 1, max: formData.recurrence_type === 'weekly' ? 52 : 12 }}
              helperText={`How many ${formData.recurrence_type === 'weekly' ? 'weeks' : 'months'} between repetitions`}
            />
          )}
          
          <TextField
            type="date"
            label="End Date (Optional)"
            value={formData.recurrence_end_date}
            onChange={(e) => handleRecurrenceChange('recurrence_end_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: formData.due_date }}
            size="small"
            helperText="Leave blank for no end date"
          />
          
          <Typography variant="caption" color="text.secondary">
            📋 All subtasks will be recreated with each recurring instance
          </Typography>
        </Stack>
      </Box>
    )}
  </Box>
)}

          {/* Assignee (optional) - Hidden for staff */}
          {!isStaff && (
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
                    setFormData(prev => ({
                      ...prev,
                      assignee_id: Number.isInteger(next) ? next : null,
                      // Remove assignee from members if present
                      members_id: Array.isArray(prev.members_id) ? prev.members_id.filter((id) => id !== next) : []
                    }));
                  }}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {availableAssignees.map((u) => (
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
          )}

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
                onChange={(e) => {
                  setMemberSearchTerm(e.target.value);
                  setShowMemberDropdown(true);
                }}
                onFocus={() => setShowMemberDropdown(true)}
              />
              {showMemberDropdown && (
                <div className="search-dropdown">
                  {filteredMembers.map(user => (
                    <div
                      key={user.user_id}
                      className={`search-dropdown-item ${formData.members_id.includes(user.user_id) ? 'selected' : ''} ${(user.user_id === formData.owner_id || user.user_id === formData.assignee_id) ? 'disabled' : ''}`}
                      onClick={() => {
                        if (user.user_id !== formData.owner_id && user.user_id !== formData.assignee_id) {
                          handleMemberSelect(user.user_id);
                        }
                      }}
                    >
                      {user.full_name} ({user.email})
                      {user.user_id === formData.owner_id && <span className="owner-badge">Owner</span>}
                      {user.user_id === formData.assignee_id && <span className="owner-badge">Assignee</span>}
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

{/* Attachments section - only for main tasks, not subtasks */}
{!parentTask && (
  <Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
      Attachments
    </Typography>
    
    <input
      ref={fileInputRef}
      type="file"
      multiple
      onChange={handleFileSelect}
      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.jfif"
      style={{ display: 'none' }}
    />
    
    <Button
      variant="outlined"
      size="small"
      startIcon={<AddIcon />}
      onClick={() => fileInputRef.current?.click()}
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
      📎 Add Attachments
    </Button>
    
    {selectedFiles.length > 0 && (
      <Box sx={{ mt: 2, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, backgroundColor: '#f9f9f9' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Selected files ({selectedFiles.length}):
        </Typography>
        {selectedFiles.map((file, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
            <Typography variant="body2">
              {file.name} <span style={{ color: '#666', fontSize: '12px' }}>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            </Typography>
            <Button
              size="small"
              onClick={() => removeFile(index)}
              sx={{ minWidth: 'auto', p: 0.5, color: '#d32f2f' }}
            >
              ×
            </Button>
          </Box>
        ))}
      </Box>
    )}
  </Box>
)}

          {/* {!parentTask && (
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
          )} */}

{/* SIMPLE: Inline Subtask Form */}
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
            required
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

          <Stack direction="row" spacing={2}>
            <TextField
              type="date"
              label="Due Date"
              value={subtask.due_date}
              onChange={(e) => updateSubtask(subtask.id, 'due_date', e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              required
              sx={{ minWidth: 180 }}
            />
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Assignee</InputLabel>
              <Select
                value={subtask.assignee_id || ''}
                label="Assignee"
                onChange={(e) => updateSubtask(subtask.id, 'assignee_id', e.target.value || null)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.user_id} value={user.user_id}>
                    {user.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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