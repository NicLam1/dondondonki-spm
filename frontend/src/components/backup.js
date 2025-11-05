// import React from 'react';
// import Button from '@mui/material/Button';
// import DownloadIcon from '@mui/icons-material/Download';

// const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

// export default function ExportReportButton({ scope, id, actingUserId, label = 'Export Report', params = {}, variant = 'outlined', size = 'small' }) {
//   const handleClick = async () => {
//     try {
//       // fallback to localStorage keys
//       let actingId = actingUserId;
//       if (!actingId) {
//         const stored = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
//         actingId = stored?.user_id || stored?.profile?.user_id || null;
//       }
//       if (!actingId) {
//         alert('Cannot export report: no logged-in user found. Please sign in.');
//         return;
//       }

//       const url = new URL(`${API_BASE.replace(/\/api\/?$/, '')}/api/reports`);
//       url.searchParams.set('scope', scope);
//       if (id) url.searchParams.set('id', String(id));
//       url.searchParams.set('acting_user_id', String(actingId));
//       if (params.start) url.searchParams.set('start', params.start);
//       if (params.end) url.searchParams.set('end', params.end);

//       const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
//       if (!resp.ok) {
//         const r = await resp.json().catch(() => ({}));
//         throw new Error(r.error || `HTTP ${resp.status}`);
//       }
//       const blob = await resp.blob();
//       // filename fallback: prefer project name if backend returned content-disposition; else build friendly name
//       const contentDisposition = resp.headers.get('content-disposition') || '';
//       let filename = (`${scope}-report${id ? `-${id}` : ''}.pdf`);
//       const match = /filename=["']?([^"';]+)["']?/.exec(contentDisposition);
//       if (match) filename = match[1];

//       const link = document.createElement('a');
//       link.href = window.URL.createObjectURL(blob);
//       link.download = filename;
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//     } catch (err) {
//       console.error('Export report failed', err);
//       alert('Failed to export report: ' + (err.message || err));
//     }
//   };

//   return (
//     <Button variant={variant} size={size} startIcon={<DownloadIcon />} onClick={handleClick}>
//       {label}
//     </Button>
//   );
// }