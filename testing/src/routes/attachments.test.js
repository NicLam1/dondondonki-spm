const request = require('supertest');
const { createTestApp } = require('../utils/createTestApp');

function seedTaskWithAccess({ taskId, ownerId, actingUserId }) {
  global.supabaseMock.tables.users.push(
    { user_id: ownerId, access_level: 1 },
    { user_id: actingUserId, access_level: 1 }
  );

  global.supabaseMock.tables.tasks.push({
    task_id: taskId,
    title: 'Tracked task',
    description: 'Attachment capable',
    owner_id: ownerId,
    members_id: [actingUserId],
    is_deleted: false,
  });
}

function getStorageBucket() {
  return global.supabaseMock.storage.from('task-attachments');
}

describe('Task attachment routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/tasks/:taskId/attachments', () => {
    it('uploads an attachment successfully', async () => {
      seedTaskWithAccess({ taskId: 2000, ownerId: 3000, actingUserId: 4000 });

      const response = await request(app)
        .post('/api/tasks/2000/attachments')
        .field('acting_user_id', '4000')
        .attach('file', Buffer.from('hello world'), 'notes.txt');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          task_id: 2000,
          original_name: 'notes.txt',
          mime_type: 'text/plain',
          uploaded_by: 4000,
        })
      );

      expect(global.supabaseMock.tables.task_attachments).toHaveLength(1);
      const stored = global.supabaseMock.tables.task_attachments[0];
      expect(stored.file_path).toMatch(/^task_2000\//);
      expect(getStorageBucket().__files.has(stored.file_path)).toBe(true);
    });

    it('returns 500 when storage upload fails', async () => {
      seedTaskWithAccess({ taskId: 2001, ownerId: 3001, actingUserId: 4001 });
      const originalFrom = global.supabaseMock.storage.from;

      try {
        global.supabaseMock.storage.from = (bucketName) => {
          const bucket = originalFrom(bucketName);
          return {
            ...bucket,
            upload: () => ({ data: null, error: { message: 'Upload failed' } }),
          };
        };

        const response = await request(app)
          .post('/api/tasks/2001/attachments')
          .field('acting_user_id', '4001')
          .attach('file', Buffer.from('oops'), 'fail.txt');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Failed to upload file: Upload failed' });
        expect(global.supabaseMock.tables.task_attachments).toHaveLength(0);
      } finally {
        global.supabaseMock.storage.from = originalFrom;
      }
    });

    it('cleans up storage when database insert fails', async () => {
      seedTaskWithAccess({ taskId: 2002, ownerId: 3002, actingUserId: 4002 });
      global.supabaseMock.__setNextResult({
        table: 'task_attachments',
        operation: 'insert',
        error: { message: 'DB insert failed' },
      });

      const response = await request(app)
        .post('/api/tasks/2002/attachments')
        .field('acting_user_id', '4002')
        .attach('file', Buffer.from('cleanup'), 'cleanup.txt');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to save attachment: DB insert failed' });
      expect(global.supabaseMock.tables.task_attachments).toHaveLength(0);
      const bucket = getStorageBucket();
      expect(bucket.__files.size).toBe(0);
    });

    it('rejects unsupported file types', async () => {
      seedTaskWithAccess({ taskId: 2003, ownerId: 3003, actingUserId: 4003 });

      const response = await request(app)
        .post('/api/tasks/2003/attachments')
        .field('acting_user_id', '4003')
        .attach('file', Buffer.from('binary'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload',
        });

      expect(response.status).toBe(500);
      expect(response.text).toContain('File type not allowed');
    });
  });

  describe('GET /api/tasks/:taskId/attachments', () => {
    it('returns attachments for authorized user', async () => {
      seedTaskWithAccess({ taskId: 2010, ownerId: 3010, actingUserId: 4010 });
      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 1,
        task_id: 2010,
        original_name: 'doc.txt',
        file_path: 'task_2010/doc.txt',
        file_size: 12,
        mime_type: 'text/plain',
        uploaded_by: 4010,
        uploader: { full_name: 'Uploader', email: 'user@example.com' },
      });

      const response = await request(app)
        .get('/api/tasks/2010/attachments')
        .query({ acting_user_id: '4010' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('returns 500 when attachment query fails', async () => {
      seedTaskWithAccess({ taskId: 2011, ownerId: 3011, actingUserId: 4011 });
      global.supabaseMock.__setNextResult({
        table: 'task_attachments',
        operation: 'select',
        error: { message: 'Query failed' },
      });

      const response = await request(app)
        .get('/api/tasks/2011/attachments')
        .query({ acting_user_id: '4011' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch attachments' });
    });
  });

  describe('GET /api/tasks/:taskId/attachments/:attachmentId/download', () => {
    it('returns a signed download URL', async () => {
      seedTaskWithAccess({ taskId: 2020, ownerId: 3020, actingUserId: 4020 });
      const bucket = getStorageBucket();
      bucket.upload('task_2020/file.txt', Buffer.from('file'), { contentType: 'text/plain' });

      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 10,
        task_id: 2020,
        original_name: 'file.txt',
        file_path: 'task_2020/file.txt',
        file_size: 4,
        mime_type: 'text/plain',
        uploaded_by: 4020,
      });

      const response = await request(app)
        .get('/api/tasks/2020/attachments/10/download')
        .query({ acting_user_id: '4020' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.download_url).toContain('https://mock.storage');
      expect(response.body.data.filename).toBe('file.txt');
    });

    it('returns 500 when signed URL generation fails', async () => {
      seedTaskWithAccess({ taskId: 2021, ownerId: 3021, actingUserId: 4021 });
      const bucket = getStorageBucket();
      bucket.upload('task_2021/broken.txt', Buffer.from('file'), { contentType: 'text/plain' });

      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 11,
        task_id: 2021,
        original_name: 'broken.txt',
        file_path: 'task_2021/broken.txt',
        file_size: 4,
        mime_type: 'text/plain',
        uploaded_by: 4021,
      });

      const originalFrom = global.supabaseMock.storage.from;
      try {
        global.supabaseMock.storage.from = (bucketName) => {
          const originalBucket = originalFrom(bucketName);
          return {
            ...originalBucket,
            createSignedUrl: () => ({ data: null, error: { message: 'URL failure' } }),
          };
        };

        const response = await request(app)
          .get('/api/tasks/2021/attachments/11/download')
          .query({ acting_user_id: '4021' });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Failed to generate download link' });
      } finally {
        global.supabaseMock.storage.from = originalFrom;
      }
    });
  });

  describe('DELETE /api/tasks/:taskId/attachments/:attachmentId', () => {
    it('allows uploader to delete attachment', async () => {
      seedTaskWithAccess({ taskId: 2030, ownerId: 3030, actingUserId: 4030 });
      const bucket = getStorageBucket();
      bucket.upload('task_2030/remove.txt', Buffer.from('file'), { contentType: 'text/plain' });

      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 20,
        task_id: 2030,
        original_name: 'remove.txt',
        file_path: 'task_2030/remove.txt',
        file_size: 4,
        mime_type: 'text/plain',
        uploaded_by: 4030,
      });

      const response = await request(app)
        .delete('/api/tasks/2030/attachments/20')
        .send({ acting_user_id: 4030 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(global.supabaseMock.tables.task_attachments).toHaveLength(0);
      expect(bucket.__files.size).toBe(0);
    });

    it('rejects deletion by non-uploader', async () => {
      seedTaskWithAccess({ taskId: 2031, ownerId: 3031, actingUserId: 4031 });
      global.supabaseMock.tables.users.push({ user_id: 4032, access_level: 2 });
      global.supabaseMock.tables.tasks
        .find((task) => task.task_id === 2031)
        .members_id.push(4032);

      const bucket = getStorageBucket();
      bucket.upload('task_2031/keep.txt', Buffer.from('file'), { contentType: 'text/plain' });

      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 21,
        task_id: 2031,
        original_name: 'keep.txt',
        file_path: 'task_2031/keep.txt',
        file_size: 4,
        mime_type: 'text/plain',
        uploaded_by: 4031,
      });

      const response = await request(app)
        .delete('/api/tasks/2031/attachments/21')
        .send({ acting_user_id: 4032 });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Can only delete your own attachments' });
    });

    it('returns 500 when database delete fails', async () => {
      seedTaskWithAccess({ taskId: 2032, ownerId: 3032, actingUserId: 4032 });
      const bucket = getStorageBucket();
      bucket.upload('task_2032/fail.txt', Buffer.from('file'), { contentType: 'text/plain' });

      global.supabaseMock.tables.task_attachments.push({
        attachment_id: 22,
        task_id: 2032,
        original_name: 'fail.txt',
        file_path: 'task_2032/fail.txt',
        file_size: 4,
        mime_type: 'text/plain',
        uploaded_by: 4032,
      });

      global.supabaseMock.__setNextResult({
        table: 'task_attachments',
        operation: 'delete',
        error: { message: 'Delete failed' },
      });

      const response = await request(app)
        .delete('/api/tasks/2032/attachments/22')
        .send({ acting_user_id: 4032 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete attachment' });
      expect(global.supabaseMock.tables.task_attachments).toHaveLength(1);
      expect(bucket.__files.has('task_2032/fail.txt')).toBe(false);
    });
  });
});
