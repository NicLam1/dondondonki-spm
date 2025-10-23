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
  const navigate = useNavigate();

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE}/notifications?user_id=${userId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const result = await response.json();
        setNotifications(result.data || []);
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
      // Mark as read first
      await fetch(`${API_BASE}/notifications/${notification.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId })
      });

      // Remove from local state immediately for better UX
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
                cursor: 'pointer', // Change to pointer cursor
                borderBottom: '1px solid #f0f0f0',
                '&:hover': {
                  backgroundColor: '#f5f5f5'
                },
                opacity: notification.read ? 0.6 : 1
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
                    <Typography variant="body2">
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

