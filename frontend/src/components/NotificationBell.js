import React, { useState, useEffect } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  Typography,
  Box,
  Button,
  Divider
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

const NotificationBell = ({ userId }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/notifications?user_id=${userId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const result = await res.json();
      return result.data || [];
    },
    enabled: Boolean(userId),
    refetchInterval: 30000 // Poll every 30 seconds
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      const res = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userId]);
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.task_id) {
      window.location.href = `/tasks?task=${notification.task_id}`;
    }
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton onClick={handleClick} color="inherit">
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, maxHeight: 480, overflow: 'auto' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="h6">Notifications</Typography>
          </Box>

          {notifications.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No notifications
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {notifications.map((notif) => (
                <React.Fragment key={notif.id}>
                  <ListItem
                    button
                    onClick={() => handleNotificationClick(notif)}
                    sx={{
                      backgroundColor: notif.read ? 'transparent' : '#f5f5ff',
                      '&:hover': { backgroundColor: notif.read ? '#f5f5f5' : '#ebebff' }
                    }}
                  >
                    <ListItemText
                      primary={notif.message}
                      secondary={new Date(notif.created_at).toLocaleString()}
                      primaryTypographyProps={{
                        fontWeight: notif.read ? 400 : 600,
                        fontSize: '0.9rem'
                      }}
                      secondaryTypographyProps={{
                        fontSize: '0.75rem'
                      }}
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default NotificationBell;

