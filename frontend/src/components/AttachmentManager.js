import React, { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

const AttachmentManager = ({ taskId, actingUserId }) => {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

// In AttachmentManager.js, update the useEffect:
useEffect(() => {
  fetchAttachments();
}, [taskId, actingUserId]); // Add actingUserId as dependency

// Add this additional useEffect to refetch when the component becomes visible again
useEffect(() => {
  if (taskId && actingUserId) {
    fetchAttachments();
  }
}, [taskId, actingUserId]);

const fetchAttachments = async () => {
  try {
    console.log('Fetching attachments for task:', taskId, 'user:', actingUserId);
    
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments?acting_user_id=${actingUserId}`, {
      credentials: 'include'
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Fetch result:', result);
    
    if (result.success) {
      setAttachments(result.data);
    }
  } catch (error) {
    console.error('Error fetching attachments:', error);
  } finally {
    setLoading(false);
  }
};

const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('acting_user_id', actingUserId);

  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const result = await response.json();
    if (result.success) {
      setAttachments(prev => [result.data, ...prev]);
      return true;
    } else {
      alert(result.error || 'Failed to upload attachment');
      return false;
    }
  } catch (error) {
    console.error('Upload error:', error);
    alert('Failed to upload attachment');
    return false;
  }
};

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);

    for (const file of files) {
      await uploadFile(file);
    }

    setUploading(false);
    e.target.value = '';
  };

const downloadAttachment = async (attachment) => {
  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments/${attachment.attachment_id}/download?acting_user_id=${actingUserId}`, {
      credentials: 'include'
    });
    const result = await response.json();
    
    if (result.success) {
      window.open(result.data.download_url, '_blank');
    }
  } catch (error) {
    console.error('Download error:', error);
  }
};

const deleteAttachment = async (attachmentId) => {
  if (!window.confirm('Are you sure you want to delete this attachment?')) return;

  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/attachments/${attachmentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acting_user_id: actingUserId })
    });

    const result = await response.json();
    if (result.success) {
      setAttachments(prev => prev.filter(a => a.attachment_id !== attachmentId));
    }
  } catch (error) {
    console.error('Delete error:', error);
  }
};

  if (loading) return <div>Loading attachments...</div>;

  return (
    <div className="attachment-manager">
      <div className="attachment-header">
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.jfif,.bmp,.tiff"
          style={{ display: 'none' }}
          id={`file-input-${taskId}`}
          disabled={uploading}
        />
        <label 
          htmlFor={`file-input-${taskId}`} 
          className={`upload-btn ${uploading ? 'disabled' : ''}`}
        >
          📎 {uploading ? 'Uploading...' : 'Add Attachment'}
        </label>
      </div>

      <div className="attachments-list">
        {attachments.length === 0 ? (
          <p className="no-attachments">No attachments</p>
        ) : (
          attachments.map(attachment => (
            <div key={attachment.attachment_id} className="attachment-item">
              <div className="attachment-info">
                <span className="attachment-name">{attachment.original_name}</span>
                <span className="attachment-meta">
                  {(attachment.file_size / 1024 / 1024).toFixed(2)} MB • 
                  by {attachment.uploader.full_name} • 
                  {new Date(attachment.uploaded_at).toLocaleDateString()}
                </span>
              </div>
              <div className="attachment-actions">
                <button 
                  onClick={() => downloadAttachment(attachment)}
                  className="download-btn"
                >
                  Download
                </button>
                {attachment.uploaded_by === actingUserId && (
                  <button 
                    onClick={() => deleteAttachment(attachment.attachment_id)}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AttachmentManager;