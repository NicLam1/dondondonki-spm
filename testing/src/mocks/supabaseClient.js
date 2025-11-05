const tablesTemplate = () => ({
  users: [],
  tasks: [],
  task_reminders: [],
  task_activity_logs: [],
  projects: [],
  task_attachments: [],
  notifications: [],
});

class SupabaseTableQuery {
  constructor(tables, tableName, sequences, hooks) {
    this.tables = tables;
    this.tableName = tableName;
    this.sequences = sequences;
    this.hooks = hooks;
    this.filters = [];
    this.selectColumns = null;
    this.orderConfig = null;
    this.limitCount = null;
    this.operation = 'select';
    this.pendingInsert = null;
    this.pendingUpdate = null;
    this.pendingDelete = false;
    this.pendingUpsert = null;
    this.rangeBounds = null;
  }

  select(columns) {
    this.selectColumns = columns;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  overlaps(column, values) {
    this.filters.push((row) => {
      const data = getAtPath(row, column);
      if (!Array.isArray(data)) return false;
      return data.some((entry) => values.includes(entry));
    });
    return this;
  }

  contains(column, values) {
    this.filters.push((row) => {
      const data = getAtPath(row, column);
      if (!Array.isArray(data)) return false;
      return values.every((entry) => data.includes(entry));
    });
    return this;
  }

  order(column, options = {}) {
    const ascending = options.ascending !== false;
    this.orderConfig = { column, ascending };
    return this;
  }

  range(from, to) {
    this.rangeBounds = { from, to };
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => getAtPath(row, column) === value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(getAtPath(row, column)));
    return this;
  }

  not(column, operator, value) {
    if (operator !== 'is') return this;
    this.filters.push((row) => getAtPath(row, column) !== value);
    return this;
  }

  inner() {
    return this;
  }

  or(expression) {
    const clauses = expression
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    this.filters.push((row) => clauses.some((clause) => evaluateClause(row, clause)));
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => getAtPath(row, column) >= value);
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => getAtPath(row, column) <= value);
    return this;
  }

  insert(rows) {
    this.operation = 'insert';
    this.pendingInsert = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.pendingUpdate = values || {};
    return this;
  }

  delete() {
    this.operation = 'delete';
    this.pendingDelete = true;
    return this;
  }

  upsert(values, options = {}) {
    this.operation = 'upsert';
    const rows = Array.isArray(values) ? values : [values];
    this.pendingUpsert = { rows, options };
    return this;
  }

  async single() {
    const { data, error } = await this.execute();
    if (error) {
      return { data: null, error };
    }
    if (Array.isArray(data)) {
      if (!data.length) return { data: null, error: null };
      return { data: data[0], error: null };
    }
    if (data == null) {
      return { data: null, error: null };
    }
    return { data, error: null };
  }

  async maybeSingle() {
    const { data, error } = await this.execute();
    if (error) {
      return { data: null, error };
    }
    if (Array.isArray(data)) {
      return { data: data[0] ?? null, error: null };
    }
    return { data: data ?? null, error: null };
  }

  async execute() {
    const hookResult = this.hooks?.consume?.(this.tableName, this.operation);
    if (hookResult) {
      return {
        data: hookResult.data != null ? cloneRow(hookResult.data) : hookResult.data ?? null,
        error: hookResult.error || null,
      };
    }

    const table = this.tables[this.tableName] || [];
    let data;

    if (this.operation === 'insert') {
      const inserted = this.pendingInsert.map((row) => {
        const clone = { ...row };
        if (this.tableName === 'tasks' && (clone.task_id == null || clone.task_id === undefined)) {
          this.sequences.tasks = (this.sequences.tasks || 0) + 1;
          clone.task_id = this.sequences.tasks;
        }
        if (this.tableName === 'projects' && (clone.project_id == null || clone.project_id === undefined)) {
          this.sequences.projects = (this.sequences.projects || 0) + 1;
          clone.project_id = this.sequences.projects;
        }
        if (this.tableName === 'task_attachments' && (clone.attachment_id == null || clone.attachment_id === undefined)) {
          this.sequences.task_attachments = (this.sequences.task_attachments || 0) + 1;
          clone.attachment_id = this.sequences.task_attachments;
        }
        if (this.tableName === 'users' && (clone.user_id == null || clone.user_id === undefined)) {
          this.sequences.users = (this.sequences.users || 0) + 1;
          clone.user_id = this.sequences.users;
        }
        this.tables[this.tableName].push(clone);
        return clone;
      });
      data = inserted;
    } else if (this.operation === 'upsert') {
      const { rows, options } = this.pendingUpsert;
      const onConflict = options?.onConflict;
      const results = [];
      rows.forEach((row) => {
        let target = null;
        if (onConflict) {
          const key = Array.isArray(onConflict) ? onConflict : [onConflict];
          target = table.find((existing) => key.every((k) => existing?.[k] === row?.[k]));
        }
        if (target) {
          Object.assign(target, row);
          results.push(target);
        } else {
          const clone = { ...row };
          if (this.tableName === 'tasks' && (clone.task_id == null || clone.task_id === undefined)) {
            this.sequences.tasks = (this.sequences.tasks || 0) + 1;
            clone.task_id = this.sequences.tasks;
          }
          if (this.tableName === 'projects' && (clone.project_id == null || clone.project_id === undefined)) {
            this.sequences.projects = (this.sequences.projects || 0) + 1;
            clone.project_id = this.sequences.projects;
          }
          if (this.tableName === 'task_attachments' && (clone.attachment_id == null || clone.attachment_id === undefined)) {
            this.sequences.task_attachments = (this.sequences.task_attachments || 0) + 1;
            clone.attachment_id = this.sequences.task_attachments;
          }
          if (this.tableName === 'users' && (clone.user_id == null || clone.user_id === undefined)) {
            this.sequences.users = (this.sequences.users || 0) + 1;
            clone.user_id = this.sequences.users;
          }
          this.tables[this.tableName].push(clone);
          results.push(clone);
        }
      });
      data = results;
    } else if (this.operation === 'update') {
      const matches = table.filter((row) => this.filters.every((fn) => fn(row)));
      matches.forEach((row) => Object.assign(row, this.pendingUpdate));
      data = matches;
    } else if (this.operation === 'delete') {
      const remaining = [];
      const removed = [];
      table.forEach((row) => {
        if (this.filters.every((fn) => fn(row))) {
          removed.push(row);
        } else {
          remaining.push(row);
        }
      });
      this.tables[this.tableName] = remaining;
      data = removed;
    } else {
      data = table.filter((row) => this.filters.every((fn) => fn(row)));
    }

    if (this.orderConfig && Array.isArray(data)) {
      const { column, ascending } = this.orderConfig;
      data = [...data].sort((a, b) => {
        const aVal = getAtPath(a, column);
        const bVal = getAtPath(b, column);
        if (aVal === bVal) return 0;
        if (aVal == null) return ascending ? -1 : 1;
        if (bVal == null) return ascending ? 1 : -1;
        if (aVal > bVal) return ascending ? 1 : -1;
        if (aVal < bVal) return ascending ? -1 : 1;
        return 0;
      });
    }

    if (this.limitCount != null && Array.isArray(data)) {
      data = data.slice(0, this.limitCount);
    }

    if (this.rangeBounds && Array.isArray(data)) {
      const { from, to } = this.rangeBounds;
      const start = Math.max(0, from || 0);
      const end = typeof to === 'number' ? to + 1 : undefined;
      data = data.slice(start, end);
    }

    this.operation = 'select';
    this.pendingInsert = null;
    this.pendingUpdate = null;
    this.pendingDelete = false;
    this.pendingUpsert = null;
    this.limitCount = null;
    this.rangeBounds = null;

    let resultData = data;
    if (Array.isArray(data)) {
      resultData = data.map(cloneRow);
    } else if (data && typeof data === 'object') {
      resultData = cloneRow(data);
    }

    return { data: resultData, error: null };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function evaluateClause(row, clause) {
  const parts = clause.split('.');
  if (parts.length < 3) return false;
  const [field, operator, valueRaw] = parts;
  const target = getAtPath(row, field);

  if (operator === 'eq') {
    const parsed = parseValue(valueRaw);
    return target === parsed;
  }

  if (operator === 'cs') {
    const inner = valueRaw.replace(/^\{|\}$/g, '');
    const entries = inner.split(',').map((item) => parseValue(item.trim())).filter((v) => v !== undefined);
    if (!Array.isArray(target)) return false;
    return entries.every((entry) => target.includes(entry));
  }

  return false;
}

function getAtPath(obj, path) {
  const parts = path.split('.');
  return parts.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function parseValue(value) {
  if (value == null) return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num)) return num;
  return trimmed;
}

function cloneRow(row) {
  return JSON.parse(JSON.stringify(row));
}

function createSupabaseMock(seed = {}) {
  const tables = Object.assign(tablesTemplate(), seed);
  const sequences = { tasks: 0, projects: 0, users: 0, task_attachments: 0 };
  const storageBuckets = new Map();
  const hooks = {
    queue: [],
    enqueue(hook) {
      this.queue.push(hook);
    },
    consume(tableName, operation) {
      const index = this.queue.findIndex((hook) => {
        const tableMatches = !hook.table || hook.table === tableName;
        const operationMatches = !hook.operation || hook.operation === operation;
        return tableMatches && operationMatches;
      });
      if (index === -1) return null;
      const [hook] = this.queue.splice(index, 1);
      return hook;
    },
    clear() {
      this.queue.length = 0;
    },
  };

  const ensureBucket = (bucket) => {
    if (!storageBuckets.has(bucket)) {
      storageBuckets.set(bucket, { files: new Map() });
    }
    return storageBuckets.get(bucket);
  };

  return {
    tables,
    sequences,
    from(tableName) {
      if (!tables[tableName]) tables[tableName] = [];
      return new SupabaseTableQuery(tables, tableName, sequences, hooks);
    },
    storage: {
      from(bucketName) {
        const bucket = ensureBucket(bucketName);
        return {
          upload(path, buffer, options = {}) {
            if (bucket.files.has(path)) {
              return { data: null, error: { message: 'File already exists' } };
            }
            bucket.files.set(path, {
              buffer,
              size: buffer?.length || 0,
              contentType: options.contentType || 'application/octet-stream',
              createdAt: new Date().toISOString(),
            });
            return { data: { path }, error: null };
          },
          remove(paths) {
            const list = Array.isArray(paths) ? paths : [paths];
            list.forEach((path) => bucket.files.delete(path));
            return { data: null, error: null };
          },
          createSignedUrl(path, expiresIn) {
            if (!bucket.files.has(path)) {
              return { data: null, error: { message: 'File not found' } };
            }
            const signedUrl = `https://mock.storage/${bucketName}/${encodeURIComponent(path)}?expires_in=${expiresIn || 0}&token=mock`;
            return { data: { signedUrl }, error: null };
          },
          __files: bucket.files,
        };
      },
      __reset() {
        storageBuckets.clear();
      },
    },
    __setNextResult(hook) {
      hooks.enqueue(hook || {});
    },
    __clearHooks() {
      hooks.clear();
    },
    auth: {
      signOut: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-user-id' } }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token' }, user: { id: 'mock-user-id' } }, error: null }),
      updateUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-user-id' } }, error: null }),
    },
  };
}

module.exports = { createSupabaseMock };
