import React, { useState } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
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
  // Only task owner can change the priority bucket
  const canChangePriority = !!(actingUser && task && actingUser.user_id === task.owner_id);

  const priorities = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `P${i + 1}` }));

  const handlePriorityChange = async (event) => {
    const newPriority = event.target.value;
    
    if (!task || !actingUser || loading || newPriority === task.priority_bucket || !canChangePriority) {
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
          priority_bucket: Number(newPriority)
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

  const dropdown = (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 140 }}>
      <FormControl 
        size={size} 
        fullWidth
        disabled={loading || disabled || !canChangePriority}
        sx={{ minWidth: 140 }}
      >
        <InputLabel sx={{ fontSize: '0.875rem' }}>Priority</InputLabel>
        <Select
          value={task?.priority_bucket ?? 5}
          label="Priority"
          onChange={handlePriorityChange}
          sx={{ 
            height: 32,
            '& .MuiSelect-select': {
              padding: '4px 8px',
              fontSize: '0.875rem'
            }
          }}
        >
          {priorities.map((priority) => (
            <MenuItem key={priority.value} value={priority.value} sx={{ fontSize: '0.875rem' }}>
              {priority.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {loading && (
        <CircularProgress size={16} sx={{ ml: 1 }} />
      )}
    </Box>
  );

  // If user doesn't have authority, wrap in tooltip
  if (!canChangePriority) {
    return (
      <Tooltip title="Only the task owner can change priority" arrow>
        <span>{dropdown}</span>
      </Tooltip>
    );
  }

  // If user has authority, show dropdown without tooltip
  return dropdown;
};

export default PrioritySelector;