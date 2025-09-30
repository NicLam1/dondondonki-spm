import React, { useState } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Chip,
  Box,
  Tooltip
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
  
  // Check if user can change priority (manager/director only)
  const canChangePriority = actingUser && actingUser.access_level > 0;
  
  const priorities = [
    { value: 'HIGH', label: 'High', color: 'error' },
    { value: 'MEDIUM', label: 'Medium', color: 'warning' },
    { value: 'LOW', label: 'Low', color: 'default' }
  ];

  const handlePriorityChange = async (event) => {
    const newPriority = event.target.value;
    
    if (!task || !actingUser || loading || newPriority === task.priority || !canChangePriority) {
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
    } catch (error) {
      if (onError) {
        onError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ...existing code...

  const dropdown = (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 80 }}>
      <FormControl 
        size={size} 
        fullWidth
        disabled={loading || disabled || !canChangePriority}
        sx={{ minWidth: 80 }}
      >
        <InputLabel sx={{ fontSize: '0.875rem' }}>Priority</InputLabel>
        <Select
          value={task?.priority || 'LOW'}
          label="Priority"
          onChange={handlePriorityChange}
          sx={{ 
            height: 32,
            '& .MuiSelect-select': {
              padding: '4px 8px',
              fontSize: '0.875rem'
            }
          }}
          renderValue={(value) => {
            const priority = priorities.find(p => p.value === value);
            return (
              <Chip 
                label={priority?.label || 'Low'} 
                color={priority?.color || 'default'} 
                variant="outlined" 
                size="small"
                sx={{ height: 20, fontSize: '0.75rem' }}
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
                sx={{ height: 20, fontSize: '0.75rem' }}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {loading && (
        <CircularProgress size={16} sx={{ ml: 1 }} />
      )}
    </Box>
  );

// ...existing code...

  // If user doesn't have authority, wrap in tooltip
  if (!canChangePriority) {
    return (
      <Tooltip title="Not authorised to change priority" arrow>
        <span>{dropdown}</span>
      </Tooltip>
    );
  }

  // If user has authority, show dropdown without tooltip
  return dropdown;
};

export default PrioritySelector;