import { AppBar, Avatar, InputBase, Paper, Toolbar, Box } from '@mui/material';
import logo from '../logo.svg';
import NotificationBell from './NotificationBell';

export default function Topbar({ userId }) {
  return (
    <AppBar position="sticky" elevation={0} color="transparent" sx={styles.appBar}>
      <Toolbar sx={styles.topToolbar}>
        <Box component="img" src={logo} alt="Logo" sx={styles.logo} />
        <Paper sx={styles.searchPaper}>
          <InputBase placeholder="Search…" sx={styles.searchInput} />
        </Paper>
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


