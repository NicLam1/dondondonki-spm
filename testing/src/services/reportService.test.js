'use strict';

jest.mock('pdfkit', () => {
  const instances = [];
  const ctor = jest.fn().mockImplementation(function MockPdfDocument() {
    const events = {};
    this.page = {
      width: 595,
      height: 842,
      margins: { left: 50, right: 50, bottom: 50 },
    };
    this.y = 50;
    this.operations = [];
    instances.push(this);

    this.on = function on(event, handler) {
      events[event] = handler;
      return this;
    };
    this.font = function font(name) {
      this.operations.push({ method: 'font', args: [name] });
      return this;
    };
    this.fontSize = function fontSize(size) {
      this.operations.push({ method: 'fontSize', args: [size] });
      return this;
    };
    this.fillColor = function fillColor(color) {
      this.operations.push({ method: 'fillColor', args: [color] });
      return this;
    };
    this.fill = function fill(value) {
      this.operations.push({ method: 'fill', args: [value] });
      return this;
    };
    this.text = function text(content, options = {}) {
      this.operations.push({ method: 'text', args: [content, options] });
      this.y += 12;
      return this;
    };
    this.moveDown = function moveDown(amount = 1) {
      this.operations.push({ method: 'moveDown', args: [amount] });
      this.y += 12 * amount;
      return this;
    };
    this.addPage = function addPage() {
      this.operations.push({ method: 'addPage' });
      this.y = 50;
      return this;
    };
    this.save = function save() {
      this.operations.push({ method: 'save' });
      return this;
    };
    this.restore = function restore() {
      this.operations.push({ method: 'restore', args: [] });
      return this;
    };
    this.roundedRect = function roundedRect(...args) {
      this.operations.push({ method: 'roundedRect', args });
      return this;
    };
    this.fillOpacity = function fillOpacity(value) {
      this.operations.push({ method: 'fillOpacity', args: [value] });
      return this;
    };
    this.moveTo = function moveTo(...args) {
      this.operations.push({ method: 'moveTo', args });
      return this;
    };
    this.lineTo = function lineTo(...args) {
      this.operations.push({ method: 'lineTo', args });
      return this;
    };
    this.lineWidth = function lineWidth(value) {
      this.operations.push({ method: 'lineWidth', args: [value] });
      return this;
    };
    this.strokeColor = function strokeColor(color) {
      this.operations.push({ method: 'strokeColor', args: [color] });
      return this;
    };
    this.stroke = function stroke() {
      this.operations.push({ method: 'stroke', args: [] });
      return this;
    };
    this.end = function end() {
      if (events.data) {
        events.data(Buffer.from('PDFDATA'));
      }
      if (events.end) {
        events.end();
      }
      return this;
    };
  });
  ctor.__getInstances = () => instances;
  ctor.__clearInstances = () => { instances.length = 0; };
  return ctor;
}, { virtual: true });

const PDFDocument = require('pdfkit');
const reportService = require('../../../backend/src/services/reportService');
const { createSupabaseMock } = require('../mocks/supabaseClient');

describe('services/reportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (typeof PDFDocument.__clearInstances === 'function') {
      PDFDocument.__clearInstances();
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sanitizeFilename', () => {
    it('replaces forbidden characters and falls back to default', () => {
      expect(reportService.sanitizeFilename('Sales/Report?.pdf')).toBe('Sales-Report-.pdf');
      expect(reportService.sanitizeFilename('  ')).toBe('report');
      expect(reportService.sanitizeFilename(null)).toBe('report');
    });
  });

  describe('makeSimplePdfBuffer', () => {
    it('emits a PDF buffer and renders empty state when no items', async () => {
      const buffer = await reportService.makeSimplePdfBuffer(
        'Task Summary',
        'For testing',
        [{ label: 'Total', value: 0 }],
        []
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      const docs = PDFDocument.__getInstances ? PDFDocument.__getInstances() : [];
      const doc = docs.at(-1);
      expect(doc).toBeDefined();
      expect(doc.operations.some((op) => op.method === 'text' && op.args[0] === 'No tasks available for this scope.')).toBe(true);
    });
  });

  describe('generateReportBuffer', () => {
    it('builds a project report with metrics and enrichment', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-11-01T00:00:00Z'));

      const supabase = createSupabaseMock({
        tasks: [
          {
            task_id: 1,
            is_deleted: false,
            project_id: 7,
            owner_id: 1,
            assignee_id: null,
            members_id: [],
            status: 'COMPLETED',
            due_date: '2025-10-01',
            created_at: '2025-09-20T00:00:00Z',
            updated_at: '2025-10-05T00:00:00Z',
          },
          {
            task_id: 2,
            is_deleted: false,
            project_id: 99,
            owner_id: 2,
            assignee_id: null,
            members_id: [],
            status: 'ONGOING',
            due_date: '2025-11-20',
            created_at: '2025-10-01T00:00:00Z',
            updated_at: '2025-10-02T00:00:00Z',
          },
        ],
        projects: [{ project_id: 7, name: 'Expansion Project' }],
        users: [
          { user_id: 1, full_name: 'Owner One', email: 'owner@example.com' },
          { user_id: 2, full_name: 'Owner Two', email: 'other@example.com' },
        ],
      });

      const buffer = await reportService.generateReportBuffer({
        supabase,
        scope: 'project',
        id: 7,
        startDate: '2025-09-01',
        endDate: '2025-12-31',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      const docs = PDFDocument.__getInstances ? PDFDocument.__getInstances() : [];
      const doc = docs[0];
      expect(doc).toBeDefined();
      const textOps = doc.operations.filter((op) => op.method === 'text').map((op) => op.args[0]);
      expect(textOps[0]).toContain('Project Report');
      expect(textOps[0]).toContain('Expansion Project');
      expect(textOps).toContain('From 2025-09-01 - To 2025-12-31');

      const valueFor = (label) => {
        const index = textOps.indexOf(`${label}:`);
        return index !== -1 ? textOps[index + 1] : undefined;
      };

      expect(valueFor('Total tasks')).toBe('1');
      expect(valueFor('Completed')).toBe('1');
      expect(valueFor('In progress')).toBe('0');
      expect(valueFor('Under review')).toBe('0');
      expect(valueFor('Overdue')).toBe('0');
      expect(valueFor('Avg time to complete (days)')).toBe('15.0');
      expect(valueFor('People involved')).toBe('1');

      expect(textOps).toContain('Owner One (owner@example.com)');
      expect(textOps).not.toContain('Owner Two (other@example.com)');
    });

    it('builds a team report and flags overdue tasks', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-11-01T00:00:00Z'));

      const supabase = createSupabaseMock({
        tasks: [
          {
            task_id: 10,
            is_deleted: false,
            owner_id: 50,
            assignee_id: null,
            members_id: [],
            status: 'ONGOING',
            due_date: '2025-11-02',
            created_at: '2025-10-01T00:00:00Z',
            updated_at: '2025-10-05T00:00:00Z',
          },
          {
            task_id: 11,
            is_deleted: false,
            owner_id: 99,
            assignee_id: null,
            members_id: [51],
            status: 'UNDER_REVIEW',
            due_date: '2025-10-20',
            created_at: '2025-09-15T00:00:00Z',
            updated_at: '2025-10-25T00:00:00Z',
          },
          {
            task_id: 12,
            is_deleted: false,
            owner_id: 99,
            assignee_id: null,
            members_id: [],
            status: 'COMPLETED',
            due_date: '2025-07-01',
            created_at: '2025-06-01T00:00:00Z',
            updated_at: '2025-07-01T00:00:00Z',
          },
        ],
        teams: [{ team_id: 3, team_name: 'Alpha Team' }],
        users: [
          { user_id: 50, team_id: 3, department_id: 8, full_name: 'Alice', email: 'alice@example.com' },
          { user_id: 51, team_id: 3, department_id: 8, full_name: 'Bob', email: 'bob@example.com' },
          { user_id: 99, team_id: 99, department_id: 8, full_name: 'Carol', email: 'carol@example.com' },
        ],
      });

      const buffer = await reportService.generateReportBuffer({
        supabase,
        scope: 'team',
        id: 3,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      const docs = PDFDocument.__getInstances ? PDFDocument.__getInstances() : [];
      const doc = docs[0];
      expect(doc).toBeDefined();
      const textOps = doc.operations.filter((op) => op.method === 'text').map((op) => op.args[0]);
      expect(textOps[0]).toContain('Team Report');
      expect(textOps[0]).toContain('Alpha Team');
      expect(textOps).not.toContain('No tasks available for this scope.');

      const valueFor = (label) => {
        const index = textOps.indexOf(`${label}:`);
        return index !== -1 ? textOps[index + 1] : undefined;
      };

      expect(valueFor('Total tasks')).toBe('2');
      expect(valueFor('Completed')).toBe('0');
      expect(valueFor('In progress')).toBe('1');
      expect(valueFor('Under review')).toBe('1');
      expect(valueFor('Overdue')).toBe('1');
      expect(valueFor('Avg time to complete (days)')).toBe('N/A');
      expect(valueFor('People involved')).toBe('3');

      expect(textOps).toContain('Alice (alice@example.com)');
      expect(textOps).toContain('Carol (carol@example.com)');
      expect(textOps.some((text) => typeof text === 'string' && text.includes('(Overdue)'))).toBe(true);
    });

    it('builds a user report with date filtering and role checks', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-11-01T00:00:00Z'));

      const supabase = createSupabaseMock({
        tasks: [
          {
            task_id: 21,
            is_deleted: false,
            owner_id: 77,
            assignee_id: null,
            members_id: [],
            status: 'ONGOING',
            due_date: '2025-11-05',
            created_at: '2025-10-01T00:00:00Z',
            updated_at: '2025-10-02T00:00:00Z',
          },
          {
            task_id: 22,
            is_deleted: false,
            owner_id: 1,
            assignee_id: 77,
            members_id: [],
            status: 'COMPLETED',
            due_date: '2025-10-31',
            created_at: '2025-10-01T00:00:00Z',
            updated_at: '2025-10-03T00:00:00Z',
          },
          {
            task_id: 23,
            is_deleted: false,
            owner_id: 2,
            assignee_id: null,
            members_id: [77],
            status: 'UNDER_REVIEW',
            due_date: '2025-10-15',
            created_at: '2025-09-10T00:00:00Z',
            updated_at: '2025-10-18T00:00:00Z',
          },
          {
            task_id: 24,
            is_deleted: false,
            owner_id: 5,
            assignee_id: null,
            members_id: [],
            status: 'ONGOING',
            due_date: '2025-11-10',
            created_at: '2025-10-05T00:00:00Z',
            updated_at: '2025-10-06T00:00:00Z',
          },
        ],
        users: [
          { user_id: 77, full_name: 'Alex Redwood', email: 'alex@example.com' },
          { user_id: 1, full_name: 'Owner One', email: 'owner1@example.com' },
          { user_id: 2, full_name: 'Owner Two', email: 'owner2@example.com' },
          { user_id: 5, full_name: 'Owner Five', email: 'owner5@example.com' },
        ],
      });

      const buffer = await reportService.generateReportBuffer({
        supabase,
        scope: 'user',
        id: 77,
        startDate: '2025-10-01',
        endDate: '2025-11-30',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      const docs = PDFDocument.__getInstances ? PDFDocument.__getInstances() : [];
      const doc = docs[0];
      expect(doc).toBeDefined();
      const textOps = doc.operations.filter((op) => op.method === 'text').map((op) => op.args[0]);
      expect(textOps[0]).toContain('User Report');
      expect(textOps[0]).toContain('Alex Redwood');
      expect(textOps).toContain('From 2025-10-01 - To 2025-11-30');

      const valueFor = (label) => {
        const index = textOps.indexOf(`${label}:`);
        return index !== -1 ? textOps[index + 1] : undefined;
      };

      expect(valueFor('Total tasks')).toBe('3');
      expect(valueFor('Completed')).toBe('1');
      expect(valueFor('In progress')).toBe('1');
      expect(valueFor('Under review')).toBe('1');
      expect(valueFor('Overdue')).toBe('1');
      expect(valueFor('Avg time to complete (days)')).toBe('2.0');
      expect(valueFor('People involved')).toBe('3');

      expect(textOps).toEqual(expect.arrayContaining([
        'Owner One (owner1@example.com)',
        'Owner Two (owner2@example.com)',
        'Alex Redwood (alex@example.com)',
      ]));
      expect(textOps.some((text) => typeof text === 'string' && text.includes('(Overdue)'))).toBe(true);
    });
  });
});
