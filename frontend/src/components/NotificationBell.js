import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Box,
  Stack,
  Divider
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

const NotificationBell = ({ userId }) => {
  const [notifications, setNotifications] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    
    // Initial fetch
    fetchNotifications();
    
    // Set up polling every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [userId]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications?user_id=${userId}`);
      if (response.ok) {
        const result = await response.json();
        const allNotifications = result.data || [];
        
        // Keep only unread notifications + any new notifications since last fetch
        const currentTime = Date.now();
        const unreadNotifications = allNotifications.filter(n => {
          // Show if unread OR if it's newer than our last fetch (new notification)
          return !n.read || new Date(n.created_at).getTime() > lastFetchTime;
        });
        
        setNotifications(unreadNotifications);
        setLastFetchTime(currentTime);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification) => {
    try {
      // Only mark as read if it's unread
      if (!notification.read) {
        await fetch(`${API_BASE}/notifications/${notification.id}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
      }

      // Remove from local state immediately
      setNotifications(prev => prev.filter(n => n.id !== notification.id));

      // Navigate to task if it has a task_id
      if (notification.task_id) {
        navigate(`/tasks?task=${notification.task_id}`);
      }

      // Close notification menu
      setAnchorEl(null);
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  // Count only truly unread notifications for the badge
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <IconButton onClick={handleClick} color="inherit">
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: { width: 360, maxHeight: 400 }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6">Notifications</Typography>
        </Box>
        <Divider />
        
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No notifications
            </Typography>
          </MenuItem>
        ) : (
          notifications.map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                '&:hover': {
                  backgroundColor: '#f5f5f5'
                },
                // Highlight new/unread notifications
                backgroundColor: !notification.read ? 'rgba(33, 150, 243, 0.08)' : 'transparent',
                opacity: notification.read ? 0.8 : 1
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: notification.read ? 'transparent' : '#2196f3'
                      }}
                    />
                    <Typography 
                      variant="body2"
                      sx={{ 
                        fontWeight: notification.read ? 'normal' : 'bold'
                      }}
                    >
                      {notification.message}
                    </Typography>
                  </Stack>
                }
                secondary={new Date(notification.created_at).toLocaleString()}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;

