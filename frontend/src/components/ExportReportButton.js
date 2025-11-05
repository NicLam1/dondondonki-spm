import React from 'react';
import Button from '@mui/material/Button';
import DownloadIcon from '@mui/icons-material/Download';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000/api';

export default function ExportReportButton({
  scope,
  id,
  name, // new prop
  actingUserId,
  label = 'Export Report',
  params = {},
  variant = 'outlined',
  size = 'small'
}) {
  const handleClick = async () => {
    try {
      let actingId = actingUserId;
      if (!actingId) {
        const stored = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
        actingId = stored?.user_id || stored?.profile?.user_id || null;
      }
      if (!actingId) {
        alert('Cannot export report: no logged-in user found. Please sign in.');
        return;
      }

      const url = new URL(`${API_BASE.replace(/\/api\/?$/, '')}/api/reports`);
      url.searchParams.set('scope', scope);
      if (id) url.searchParams.set('id', String(id));
      url.searchParams.set('acting_user_id', String(actingId));
      if (params.start) url.searchParams.set('start', params.start);
      if (params.end) url.searchParams.set('end', params.end);

      const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
      if (!resp.ok) {
        const r = await resp.json().catch(() => ({}));
        throw new Error(r.error || `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();

      const contentDisposition = resp.headers.get('content-disposition') || '';
      let filename = '';
      const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/.exec(contentDisposition);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      } else {
        // Prefer provided name, then params.name, then id
        const scopeLabelMap = {
          project: 'Project Report',
          team: 'Team Report',
          department: 'Department Report',
          user: 'User Report',
          company: 'Company Report'
        };
        const baseLabel = scopeLabelMap[scope] || 'Report';
        const displayName = (name || params.name || (id ? String(id) : '')).trim();
        filename = displayName ? `${baseLabel} - ${displayName}.pdf` : `${baseLabel}.pdf`;
      }

      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export report failed', err);
      alert('Failed to export report: ' + (err.message || err));
    }
  };

  return (
    <Button variant={variant} size={size} startIcon={<DownloadIcon />} onClick={handleClick}>
      {label}
    </Button>
  );
}