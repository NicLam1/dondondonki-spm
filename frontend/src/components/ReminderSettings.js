import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Alert,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const ReminderSettings = ({ task, actingUserId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(3);
  const [frequencyPerDay, setFrequencyPerDay] = useState(1);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState(null);

  const isOwner = task?.owner_id === actingUserId;

  // Fetch current reminder settings
  useEffect(() => {
    if (!task?.task_id || !actingUserId) return;

    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE}/tasks/${task.task_id}/reminders?acting_user_id=${actingUserId}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch reminder settings');
        }

        const result = await response.json();
        const settings = result.data;

        setEnabled(settings.enabled || false);
        setDaysBefore(settings.days_before || 3);
        setFrequencyPerDay(settings.frequency_per_day || 1);
        
        setOriginalSettings({
          enabled: settings.enabled || false,
          days_before: settings.days_before || 3,
          frequency_per_day: settings.frequency_per_day || 1
        });

        setHasChanges(false);
      } catch (error) {
        console.error('Error fetching reminder settings:', error);
        onError?.(error.message || 'Failed to load reminder settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [task?.task_id, actingUserId, onError]);

  // Track changes
  useEffect(() => {
    if (!originalSettings) return;
    
    const changed = 
      enabled !== originalSettings.enabled ||
      daysBefore !== originalSettings.days_before ||
      frequencyPerDay !== originalSettings.frequency_per_day;
    
    setHasChanges(changed);
  }, [enabled, daysBefore, frequencyPerDay, originalSettings]);

  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSaving(true);

      const response = await fetch(
        `${API_BASE}/tasks/${task.task_id}/reminders`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            acting_user_id: actingUserId,
            enabled,
            days_before: daysBefore,
            frequency_per_day: frequencyPerDay
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save reminder settings');
      }

      const result = await response.json();
      
      // Update original settings to match current
      setOriginalSettings({
        enabled,
        days_before: daysBefore,
        frequency_per_day: frequencyPerDay
      });
      
      setHasChanges(false);
      onSuccess?.(result.message || 'Reminder settings saved');
    } catch (error) {
      console.error('Error saving reminder settings:', error);
      onError?.(error.message || 'Failed to save reminder settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (event) => {
    setEnabled(event.target.checked);
  };

  const getDaysBeforeLabel = (days) => {
    if (days === 1) return '1 day before';
    if (days === 3) return '3 days before';
    if (days === 7) return '7 days before';
    return `${days} days before`;
  };

  const getFrequencyLabel = (freq) => {
    if (freq === 1) return 'Once per day';
    if (freq === 2) return 'Twice per day';
    if (freq === 3) return 'Three times per day';
    return `${freq} times per day`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!task?.due_date) {
    return (
      <Alert severity="info" icon={<InfoOutlinedIcon />}>
        Task reminders are only available for tasks with a due date. 
        Please add a due date to enable reminders.
      </Alert>
    );
  }

  if (!isOwner) {
    return (
      <Alert severity="info" icon={<InfoOutlinedIcon />}>
        Only the task owner can configure reminder settings.
        {enabled && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" display="block">
              Current settings: {getDaysBeforeLabel(daysBefore)}, {getFrequencyLabel(frequencyPerDay)}
            </Typography>
          </Box>
        )}
      </Alert>
    );
  }

  return (
    <Box sx={styles.container}>
      {/* Header with toggle */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {enabled ? (
            <NotificationsActiveIcon color="primary" sx={{ mr: 1 }} />
          ) : (
            <NotificationsOffIcon color="disabled" sx={{ mr: 1 }} />
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Task Reminders
          </Typography>
        </Box>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          color="primary"
        />
      </Stack>

      {/* Settings (shown when enabled) */}
      {enabled && (
        <Stack spacing={2} sx={{ mb: 2 }}>
          {/* Days Before Selection */}
          <FormControl fullWidth size="small">
            <InputLabel id="days-before-label">Start Reminders</InputLabel>
            <Select
              labelId="days-before-label"
              value={daysBefore}
              label="Start Reminders"
              onChange={(e) => setDaysBefore(e.target.value)}
            >
              <MenuItem value={1}>
                <Box>
                  <Typography variant="body2">1 Day Before</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Reminders start 1 day before due date
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value={3}>
                <Box>
                  <Typography variant="body2">3 Days Before</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Reminders start 3 days before due date
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value={7}>
                <Box>
                  <Typography variant="body2">7 Days Before</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Reminders start 7 days before due date
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Frequency Selection */}
          <FormControl fullWidth size="small">
            <InputLabel id="frequency-label">Reminder Frequency</InputLabel>
            <Select
              labelId="frequency-label"
              value={frequencyPerDay}
              label="Reminder Frequency"
              onChange={(e) => setFrequencyPerDay(e.target.value)}
            >
              <MenuItem value={1}>
                <Box>
                  <Typography variant="body2">Once per day</Typography>
                  <Typography variant="caption" color="text.secondary">
                    One reminder every day
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value={2}>
                <Box>
                  <Typography variant="body2">Twice per day</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Morning and evening reminders
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value={3}>
                <Box>
                  <Typography variant="body2">Three times per day</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Morning, afternoon, and evening
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Info box */}
          <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ fontSize: '0.85rem' }}>
            <Typography variant="caption" display="block">
              You'll receive <strong>{frequencyPerDay} reminder{frequencyPerDay > 1 ? 's' : ''}</strong> per day 
              starting <strong>{daysBefore} day{daysBefore > 1 ? 's' : ''}</strong> before the task is due.
            </Typography>
            {task.due_date && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                Due date: <strong>{new Date(task.due_date).toLocaleDateString()}</strong>
              </Typography>
            )}
          </Alert>
        </Stack>
      )}

      {/* Disabled state info */}
      {!enabled && (
        <Alert severity="default" icon={<InfoOutlinedIcon />} sx={{ fontSize: '0.85rem' }}>
          <Typography variant="caption">
            Enable reminders to receive notifications before your task is due.
          </Typography>
        </Alert>
      )}

      {/* Save button (shown when changes exist) */}
      {hasChanges && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Stack direction="row" spacing={1}>
            <Chip
              label="Unsaved changes"
              size="small"
              color="warning"
              variant="outlined"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...styles.saveButton,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'wait' : 'pointer'
              }}
            >
              {saving ? 'Saving...' : 'Save Reminder Settings'}
            </button>
          </Stack>
        </Box>
      )}

      {/* Status indicator when no changes */}
      {!hasChanges && enabled && (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Chip
            label="Reminders Active"
            size="small"
            color="success"
            icon={<NotificationsActiveIcon />}
          />
        </Box>
      )}
    </Box>
  );
};

const styles = {
  container: {
    p: 2,
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    backgroundColor: '#fafafa'
  },
  saveButton: {
    padding: '6px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(180deg, #6A11CB 0%, #4E54C8 100%)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(106,17,203,0.24)'
  }
};

export default ReminderSettings;

