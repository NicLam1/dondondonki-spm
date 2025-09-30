import { Avatar, Badge, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';

const SIDEBAR_WIDTH = 240;
const SIDEBAR_MINI_WIDTH = 80;

export default function Sidebar({ open = true, onToggle, items = [], title = 'DonkiBoard' }) {
  return (
    <Drawer
      variant="permanent"
      PaperProps={{
        sx: {
          ...styles.drawerPaper,
          width: open ? SIDEBAR_WIDTH : SIDEBAR_MINI_WIDTH,
        },
      }}
      sx={{ ...styles.drawer, width: open ? SIDEBAR_WIDTH + 16 : SIDEBAR_MINI_WIDTH + 16 }}
    >
      <Toolbar sx={{ ...styles.drawerToolbar, justifyContent: open ? 'space-between' : 'center' }}>
        {open && (
          <Typography variant="subtitle1" noWrap sx={styles.brandTitle}>{title}</Typography>
        )}
        <IconButton onClick={onToggle} sx={styles.drawerToggleButton}>
          {open ? <MenuOpenIcon /> : <MenuIcon />}
        </IconButton>
      </Toolbar>
      <Divider sx={styles.drawerDivider} />
      <List sx={styles.drawerList}>
        {items.map((item) => (
          <ListItemButton
            key={item.key}
            sx={{
              ...styles.drawerItemButton,
              justifyContent: open ? 'flex-start' : 'center',
              px: open ? 2.5 : 1,
            }}
          >
            <ListItemIcon
              sx={{
                ...styles.drawerItemIcon,
                minWidth: open ? 40 : 0,
                mr: open ? 2 : 0,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              {item.badge ? (
                <Badge color="secondary" badgeContent={item.badge} overlap="circular">
                  {item.icon}
                </Badge>
              ) : (
                item.icon
              )}
            </ListItemIcon>
            {open && <ListItemText primary={item.label} />}
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
}

const styles = {
  drawer: { flexShrink: 0, '& .MuiDrawer-paper': { boxSizing: 'border-box' } },
  drawerPaper: {
    transition: 'width 200ms ease',
    overflowX: 'hidden',
    background: 'linear-gradient(180deg, #6a11cb 0%, #4e54c8 50%, #6a11cb 100%)',
    color: 'white',
    borderRight: 0,
    ml: 2,
    my: 2,
    height: 'calc(100vh - 32px)',
    borderRadius: 3,
    boxShadow: '0 8px 24px rgba(78,84,200,0.28)',
  },
  drawerToolbar: { display: 'flex', alignItems: 'center' },
  brandTitle: { fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 },
  drawerToggleButton: { color: 'white' },
  drawerDivider: { borderColor: 'rgba(255,255,255,0.3)' },
  drawerList: { py: 1 },
  drawerItemButton: { px: 2.5, py: 1.25, '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' } },
  drawerItemIcon: { minWidth: 40, color: 'inherit' },
  flexGrow: { flexGrow: 1 },
  drawerFooter: { p: 2, display: 'flex', alignItems: 'center' },
  footerHeading: { opacity: 0.8 },
  footerText: { opacity: 0.6, display: 'block' },
  footerAvatar: { bgcolor: 'rgba(255,255,255,0.2)' },
};


