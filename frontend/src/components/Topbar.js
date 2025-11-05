import React from 'react';
import { AppBar, Avatar, InputBase, Paper, Toolbar, Box } from '@mui/material';
import logo from '../logo.svg';
import NotificationBell from './NotificationBell';
import ExportReportButton from './ExportReportButton';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

export default function Topbar({ userId }) {
  // tolerant parsing of localStorage keys used across app parts
  const rawStored = localStorage.getItem('currentUser') || localStorage.getItem('user') || null;
  let stored = null;
  try { stored = rawStored ? JSON.parse(rawStored) : null; } catch { stored = null; }

  // If auth stored object contains a profile, prefer profile fields so profile.role/profile.access_level win
  const currentUser = stored
    ? (stored.profile ? { ...stored, ...stored.profile } : stored)
    : null;

  // Normalize role: prefer profile.role, then top-level role, then numeric access_level
  const roleRaw = currentUser?.role ?? currentUser?.access_level ?? currentUser?.accessLevel ?? null;
  let role = '';
  if (typeof roleRaw === 'string') {
    role = roleRaw.toUpperCase();
  } else if (typeof roleRaw === 'number') {
    // map numeric access levels consistently: 0=STAFF,1=MANAGER,2=DIRECTOR,3=HR
    if (roleRaw === 1) role = 'MANAGER';
    else if (roleRaw === 2) role = 'DIRECTOR';
    else if (roleRaw === 3) role = 'HR';
    else role = 'STAFF';
  }

  // debug: print role info to console and expose to window for quick inspection
  console.log('Topbar debug currentUser:', currentUser);
  console.log('Topbar debug roleRaw:', roleRaw, 'normalized role:', role);
  // helpful in console: window.__CURRENT_USER__ -> inspect shape
  window.__CURRENT_USER__ = currentUser;

  const actingUserId = currentUser?.user_id || currentUser?.profile?.user_id || userId || null;

  const [teamName, setTeamName] = React.useState(currentUser?.team_name || '');
  const [deptName, setDeptName] = React.useState(currentUser?.department_name || '');

  React.useEffect(() => {
    const tid = currentUser?.team_id;
    if (tid && !teamName) {
      fetch(`${API_BASE.replace(/\/api\/?$/, '')}/api/teams/${tid}`, { credentials: 'include' })
        .then((r) => r.json().catch(() => ({})))
        .then((body) => {
          const tn = body.team_name || (body.data && body.data.team_name) || body.name || '';
          if (tn) setTeamName(tn);
        })
        .catch(() => {});
    }
    const did = currentUser?.department_id;
    if (did && !deptName) {
      fetch(`${API_BASE.replace(/\/api\/?$/, '')}/api/departments/${did}`, { credentials: 'include' })
        .then((r) => r.json().catch(() => ({})))
        .then((body) => {
          const dn = body.department_name || (body.data && body.data.department_name) || body.name || '';
          if (dn) setDeptName(dn);
        })
        .catch(() => {});
    }
  }, [currentUser, teamName, deptName]);

  return (
    <AppBar position="sticky" elevation={0} color="transparent" sx={styles.appBar}>
      <Toolbar sx={styles.topToolbar}>
        <Box component="img" src={logo} alt="Logo" sx={styles.logo} />
        <Paper sx={styles.searchPaper}>
          <InputBase placeholder="Search…" sx={styles.searchInput} />
        </Paper>

        {/* role-based report buttons */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mr: 1 }}>
          {/* Team report: only for MANAGER */}
          {role === 'MANAGER' && currentUser?.team_id && (
            <ExportReportButton
              scope="team"
              id={currentUser.team_id}
              name={teamName}
              actingUserId={actingUserId}
              label="Team Report"
            />
          )}

          {/* Department report: only for DIRECTOR or HR */}
          {(role === 'DIRECTOR') && currentUser?.department_id && (
            <ExportReportButton
              scope="department"
              id={currentUser.department_id}
              name={deptName}
              actingUserId={actingUserId}
              label="Department Report"
            />
          )}

          {/* Company-wide report: HR or DIRECTOR */}
          {(role === 'HR') && (
            <ExportReportButton
              scope="company"
              actingUserId={actingUserId}
              label="Company Report"
            />
          )}
        </Box>
        
        {userId && <NotificationBell userId={userId} />}
        <Avatar>ML</Avatar>
      </Toolbar>
    </AppBar>
  );
}

const styles = {
  appBar: {
    backdropFilter: 'blur(4px)',
    borderBottom: '1px solid #ede7ff',
    backgroundColor: 'rgba(255,255,255,0.85)',
    mx: 2,
    mb: 2,
    borderRadius: 3,
    boxShadow: '0 8px 24px rgba(78,84,200,0.12)',
    overflow: 'hidden',
    width: 'calc(100% - 32px)',
    boxSizing: 'border-box',
    top: 16,
  },
  topToolbar: { gap: 2 },
  logo: { height: 32, width: 32, borderRadius: 1.5 },
  searchPaper: { px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, flex: 1, boxShadow: 'none', border: '1px solid #e8e0ff' },
  searchInput: { flex: 1 },
};


