import React, { useState, useEffect } from 'react';
import './TaskForm.css';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const TaskForm = ({ isOpen, onClose, onSubmit, parentTask = null, users = [], actingUserId }) => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'TO_DO',
    priority: 'MEDIUM',
    due_date: '',
    project: parentTask?.project || '',
    owner_id: actingUserId || '',
    members_id: [],
    acting_user_id: actingUserId || ''
  });

  const [subtasks, setSubtasks] = useState([]);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        owner_id: actingUserId || ''
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
      alert('Due date cannot be in the past');
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMemberSelect = (userId) => {
    const currentMembers = formData.members_id || [];
    // Prevent selecting the owner as a member
    if (userId === formData.owner_id) {
        alert('The owner cannot be added as a member');
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
      status: 'TO_DO',
      priority: 'MEDIUM',
      due_date: '',
      owner_id: formData.owner_id
    };
    setSubtasks(prev => [...prev, newSubtask]);
    setShowSubtaskForm(true);
  };

  const updateSubtask = (id, field, value) => {
    // Validate due_date for subtasks too
    if (field === 'due_date' && value && value < today) {
      alert('Due date cannot be in the past');
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
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create main task or subtask
      const endpoint = parentTask 
        ? `/tasks/${parentTask.task_id}/subtask`
        : '/tasks';
      
      const taskResponse = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          parent_task_id: parentTask?.task_id || null
        }),
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
                ...subtask,
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
        status: 'TO_DO',
        priority: 'MEDIUM',
        due_date: '',
        project: '',
        owner_id: actingUserId || '',
        members_id: [],
        acting_user_id: actingUserId || ''
      });
      setSubtasks([]);
      setShowSubtaskForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
      alert(`Failed to create task: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedOwner = users.find(user => user.user_id === formData.owner_id);
  const selectedMembers = formData.members_id.map(id => users.find(user => user.user_id === id)).filter(Boolean);

  return (
    <div className="task-form-overlay">
      <div className="task-form-container">
        <div className="task-form-header">
          <h2>{parentTask ? `Add Subtask to "${parentTask.title}"` : 'Add New Task'}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="task-form">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="Enter task title"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Enter task description"
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
              >
                <option value="TO_DO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="due_date">Due Date</label>
              <input
                type="date"
                id="due_date"
                name="due_date"
                value={formData.due_date}
                onChange={handleInputChange}
                min={today}
              />
            </div>

            <div className="form-group">
              <label htmlFor="project">Project</label>
              <input
                type="text"
                id="project"
                name="project"
                value={formData.project}
                onChange={handleInputChange}
                placeholder="Enter project name"
              />
            </div>
          </div>

          {/* Owner field - only show for main tasks, not subtasks */}
          {!parentTask && (
            <div className="form-group">
              <label htmlFor="owner_search">Owner *</label>
              <div className="search-container">
                <input
                  type="text"
                  id="owner_search"
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
            </div>
          )}

          {/* For subtasks, show owner as read-only */}
          {parentTask && (
            <div className="form-group">
              <label>Owner (Inherited from Parent Task)</label>
              <input
                type="text"
                value={selectedOwner ? `${selectedOwner.full_name} (${selectedOwner.email})` : 'Loading...'}
                disabled
                className="disabled-input"
              />
            </div>
          )}

          <div className="form-group">
            <label>Members</label>
            <div className="search-container">
              <input
                type="text"
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
                    {filteredMembers.slice(0, 10).map(user => (
                        <div
                            key={user.user_id}
                            className={`search-dropdown-item ${
                                formData.members_id.includes(user.user_id) ? 'selected' : ''
                            } ${
                                user.user_id === formData.owner_id ? 'disabled' : ''
                            }`}
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
            
            {/* Selected members display */}
            {selectedMembers.length > 0 && (
              <div className="selected-members">
                {selectedMembers.map(member => (
                  <div key={member.user_id} className="member-tag">
                    {member.full_name}
                    <button
                      type="button"
                      onClick={() => handleMemberRemove(member.user_id)}
                      className="remove-member-btn"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <small>
              {parentTask 
                ? 'Only parent task owner and members can be selected'
                : 'Search and select organization members'
              }
            </small>
          </div>

          {/* Subtasks section - only show for main tasks, not subtasks */}
          {!parentTask && (
            <div className="subtasks-section">
              <div className="subtasks-header">
                <h3>Subtasks</h3>
                <button
                  type="button"
                  onClick={addSubtask}
                  className="add-subtask-btn"
                >
                  + Add Subtask
                </button>
              </div>

              {subtasks.map((subtask) => (
                <div key={subtask.id} className="subtask-form">
                  <div className="subtask-header">
                    <h4>Subtask {subtasks.indexOf(subtask) + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeSubtask(subtask.id)}
                      className="remove-subtask-btn"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Subtask title"
                      value={subtask.title}
                      onChange={(e) => updateSubtask(subtask.id, 'title', e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <textarea
                      placeholder="Subtask description"
                      value={subtask.description}
                      onChange={(e) => updateSubtask(subtask.id, 'description', e.target.value)}
                      rows="2"
                    />
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <select
                        value={subtask.priority}
                        onChange={(e) => updateSubtask(subtask.id, 'priority', e.target.value)}
                      >
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    
                    <div className="form-group">
                        <label>Due Date</label>
                      <input
                        type="date"
                        value={subtask.due_date}
                        onChange={(e) => updateSubtask(subtask.id, 'due_date', e.target.value)}
                        min={today}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="submit-btn">
              {isSubmitting ? 'Creating...' : (parentTask ? 'Create Subtask' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskForm;