import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

// Use the same fetchJson pattern as TasksPage
async function fetchJson(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Network error");
  return res.json();
}

export default function DeleteButton({ task, actingUserId, onSuccess, onError }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ subtaskCount: 0, taskTitle: '' });
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if user can delete this task (owner or assignee)
  const canDelete = actingUserId && task && (task.owner_id === parseInt(actingUserId) || task.assignee_id === parseInt(actingUserId));

  if (!canDelete) return null;

  const handleDeleteClick = async () => {
    try {
      // Get descendants count for confirmation
      const descendantsResp = await fetchJson(`/tasks/${task.task_id}/descendants`);
      const descendants = descendantsResp?.data || [];
      
      setDeleteConfirmation({
        subtaskCount: descendants.length,
        taskTitle: task.title
      });
      setDeleteDialogOpen(true);
    } catch (error) {
      onError?.("Failed to check task dependencies.");
    }
  };

  const confirmDelete = async () => {
    if (!task || !actingUserId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/tasks/${task.task_id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: parseInt(actingUserId) })
      });

      const result = await response.json();
      
      if (!response.ok) {
        onError?.(result.error || "Failed to delete task");
        return;
      }

      onSuccess?.(result.message);
      setDeleteDialogOpen(false);
    } catch (error) {
      onError?.("Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        color="error"
        startIcon={<DeleteIcon />}
        onClick={handleDeleteClick}
        size="small"
      >
        Delete
      </Button>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, boxShadow: "0 10px 30px rgba(16,24,40,0.15)" } }}
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <DeleteIcon color="error" />
            <Typography variant="h6">Delete Task</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete <strong>"{deleteConfirmation.taskTitle}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            • This task will be marked as deleted (not permanently removed)
          </Typography>
          {deleteConfirmation.subtaskCount > 0 && (
            <Typography variant="body2" color="error.main" sx={{ fontWeight: 'bold' }}>
              • This will also delete {deleteConfirmation.subtaskCount} subtask{deleteConfirmation.subtaskCount > 1 ? 's' : ''}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            You can restore deleted tasks from the Trash view.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
            onClick={confirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Task'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}