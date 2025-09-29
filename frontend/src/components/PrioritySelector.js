import React, { useState, useRef, useEffect } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Chip,
  Box
} from '@mui/material';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const PrioritySelector = ({ 
  task, 
  actingUser, 
  onSuccess, 
  onError,
  disabled = false,
  size = "small"
}) => {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const selectRef = useRef(null);
  
  // Check if user can change priority (manager/director only)
  const canChangePriority = actingUser && actingUser.access_level > 0;
  
  const priorities = [
    { value: 'HIGH', label: 'High', color: 'error' },
    { value: 'MEDIUM', label: 'Medium', color: 'warning' },
    { value: 'LOW', label: 'Low', color: 'default' }
  ];

  const currentPriority = priorities.find(p => p.value === task?.priority) || priorities[2];

  // Auto-focus the select when editing starts
  useEffect(() => {
    if (isEditing && selectRef.current) {
      setTimeout(() => {
        selectRef.current.focus();
      }, 100);
    }
  }, [isEditing]);

  const handlePriorityChange = async (newPriority) => {
    if (!task || !actingUser || loading || newPriority === task.priority) {
      setIsEditing(false);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tasks/${task.task_id}/priority`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          acting_user_id: actingUser.user_id,
          priority: newPriority
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update priority');
      }

      if (onSuccess) {
        onSuccess(result.message, result.data);
      }
      setIsEditing(false);
    } catch (error) {
      if (onError) {
        onError(error.message);
      }
      setIsEditing(false);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canChangePriority && !disabled && !loading) {
      setIsEditing(true);
    }
  };

  // If not editing, show as clickable chip
  if (!isEditing) {
    return (
      <Box 
        onClick={handleChipClick}
        sx={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <Chip 
          label={currentPriority.label} 
          color={currentPriority.color} 
          variant="outlined" 
          size={size}
          sx={{
            cursor: canChangePriority && !disabled && !loading ? 'pointer' : 'default',
            '&:hover': canChangePriority && !disabled && !loading ? {
              backgroundColor: 'action.hover'
            } : {}
          }}
          disabled={loading}
        />
        {loading && (
          <CircularProgress size={16} sx={{ ml: 1 }} />
        )}
      </Box>
    );
  }

  // If editing, show dropdown
  return (
    <FormControl 
      size={size} 
      sx={{ minWidth: 100 }} 
      disabled={loading}
    >
      <Select
        ref={selectRef}
        value={task?.priority || 'LOW'}
        open={isEditing}
        onClose={() => setIsEditing(false)}
        onChange={(e) => handlePriorityChange(e.target.value)}
        onBlur={() => setIsEditing(false)}
        displayEmpty
        renderValue={(value) => {
          const priority = priorities.find(p => p.value === value);
          return (
            <Chip 
              label={priority?.label || 'Low'} 
              color={priority?.color || 'default'} 
              variant="outlined" 
              size="small"
            />
          );
        }}
      >
        {priorities.map((priority) => (
          <MenuItem key={priority.value} value={priority.value}>
            <Chip 
              label={priority.label} 
              color={priority.color} 
              variant="outlined" 
              size="small"
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default PrioritySelector;