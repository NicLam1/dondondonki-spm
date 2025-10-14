
import React, { useState } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Sidebar from '../components/Sidebar';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import MailIcon from '@mui/icons-material/Mail';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";


export default function ChangePassword() {
  const sidebarItems = [
    { key: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard' },
    { key: 'calendar', icon: <CalendarMonthIcon />, label: 'Calendar' },
    { key: 'profile', icon: <PersonIcon />, label: 'Profile' },
    { key: 'settings', icon: <SettingsIcon />, label: 'Settings' },
    { key: 'messages', icon: <MailIcon />, label: 'Messages', badge: 12 },
  ];

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Get user email from localStorage (assuming you store it after login)
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const email = user.email || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!oldPassword || !newPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (!email) {
      setError('User email not found. Please log in again.');
      return;
    }
    try {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, old_password: oldPassword, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || 'Password changed successfully.');
        setError('');
        setOldPassword('');
        setNewPassword('');
      } else {
        setError(data.error || 'Failed to change password.');
        setMessage('');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setMessage('');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f6fa' }}>
      <Sidebar items={sidebarItems} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Paper elevation={3} style={{ width: 370, padding: 32, borderRadius: 12 }}>
          <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Change Password</h2>
          <form onSubmit={handleSubmit}>
            <TextField
              label="Old Password"
              type="password"
              variant="outlined"
              fullWidth
              margin="normal"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
            />
            <TextField
              label="New Password"
              type="password"
              variant="outlined"
              fullWidth
              margin="normal"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              style={{ marginTop: 20, padding: '10px 0' }}
            >
              Change Password
            </Button>
          </form>
          {(message || error) && (
            <div style={{ marginTop: 18, textAlign: 'center' }}>
              {message && <span style={{ color: 'green' }}>{message}</span>}
              {error && <span style={{ color: 'red' }}>{error}</span>}
            </div>
          )}
        </Paper>
      </div>
    </div>
  );
}
