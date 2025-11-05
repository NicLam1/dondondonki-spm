const PDFDocument = require('pdfkit');

// add/export sanitize helper
function sanitizeFilename(name) {
  return (name || '').replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'report';
}

// Replace makeSimplePdfBuffer with the improved layout
function makeSimplePdfBuffer(title, subtitle, metrics, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const usableWidth = pageWidth - marginLeft - marginRight;

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('black').text(title, { align: 'left' });
    if (subtitle) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('gray').text(subtitle, { align: 'left' });
    }
    doc.moveDown(0.6);

    // Metrics: render as key / value rows (left label column)
    // Metrics: render in two fixed columns so values align vertically
    const labelCol = 180;
    const valueCol = usableWidth - labelCol - 8; // small gap
    doc.fontSize(11).font('Helvetica');
    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      const y = doc.y;
      // left label (fixed column)
      doc.font('Helvetica').fillColor('#222').text(`${m.label}:`, marginLeft, y, { width: labelCol, align: 'left' });
      // right value (fixed x so all values align)
      doc.font('Helvetica-Bold').fillColor('#000').text(String(m.value), marginLeft + labelCol + 8, y, { width: valueCol, align: 'left' });
      doc.moveDown(0.9);
    }

    doc.moveDown(0.4);

    // If no items, finish
    if (!items || items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('gray').text('No tasks available for this scope.', { align: 'left' });
      doc.moveDown(1);
    } else {
      // Tasks: render each task as a two-column card (labels on left)
      const cardPadding = 8;
      const cardInnerWidth = usableWidth - cardPadding * 2;
      const leftCol = 120;
      const rightCol = cardInnerWidth - leftCol;

      const renderTaskCard = (task) => {
        // Start card
        const startY = doc.y;
        // reserve some height; we'll adjust as we write
        // draw background rectangle for card header area later if desired
        // Ensure page break if near bottom
        if (doc.y > pageHeight - doc.page.margins.bottom - 120) doc.addPage();

        // draw card border background (light)
        const cardX = marginLeft;
        const cardY = doc.y;
        // Draw light background rectangle
        doc.save();
        doc.roundedRect(cardX - 2, cardY - 2, usableWidth + 4, 10).fillOpacity(0.02).fill('#000000').fillOpacity(1).restore();

        // Fields to show and label order
        const fields = [
          { key: 'task_id', label: 'ID' },
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status' },
          { key: 'due_date', label: 'Due' },
          { key: 'owner_name', label: 'Owner' },
          { key: 'assignee_name', label: 'Assignee' }
        ];

        // Normalize values (strings); ensure owner_name/assignee_name exist
        const safe = (v) => (v == null || v === '') ? '—' : String(v);

        // Render rows in this card
        doc.moveDown(0.2);
        const rowHeightEstimate = 12;
        for (const f of fields) {
          const yRow = doc.y;
          // left label
          doc.font('Helvetica').fontSize(9).fillColor('#444').text(f.label, marginLeft + cardPadding, yRow, { width: leftCol, align: 'left' });
          // value — allow wrapping in right column
          let value = '';
          if (f.key === 'due_date') {
            value = task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : '—';
          } else {
            value = safe(task[f.key]);
          }
          // If overdue flag exists, append marker
          if (f.key === 'assignee_name' && task.overdue) {
            value = `${value} ${task.overdue ? '(Overdue)' : ''}`;
          }
          doc.font('Helvetica').fontSize(9).fillColor('#000').text(value, marginLeft + cardPadding + leftCol + 8, yRow, { width: rightCol, align: 'left' });

          // Move down based on tallest of label/value (approx)
          // measure approximate lines: compute lines by splitting on newline and wrap length
          doc.moveDown(1);
        }

        // small separator
        doc.moveDown(0.2);
        // draw thin divider line
        const dividerY = doc.y;
        doc.save();
        doc.moveTo(marginLeft, dividerY).lineTo(marginLeft + usableWidth, dividerY).lineWidth(0.3).strokeColor('#e0e0e0').stroke();
        doc.restore();
        doc.moveDown(0.6);
      };

      // Render each task
      for (let i = 0; i < items.length; i++) {
        const task = items[i];
        renderTaskCard(task);
      }
    }

    // Footer timestamp
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor('gray').text(`Generated: ${new Date().toISOString()}`, { align: 'right' });

    doc.end();
  });
}

async function queryTasks(supabase, filterFn) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_deleted', false);
  if (error) throw error;
  return (data || []).filter(filterFn);
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

async function generateReportBuffer({ supabase, scope, id, startDate, endDate }) {
  // add start/end so date-filtering works
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  let title = 'Report';
  let filterFn = (t) => true;

  if (scope === 'project') {
    const pid = Number(id);
    title = pid ? `Project Report — Project ${pid}` : 'Project Report';
    if (!Number.isNaN(pid)) {
      try {
        const { data: proj, error: pErr } = await supabase
          .from('projects')
          .select('project_id, name')
          .eq('project_id', pid)
          .maybeSingle();
        if (!pErr && proj && proj.name) title = `Project Report — ${proj.name}`;
      } catch (e) { /* ignore and use fallback */ }
      filterFn = (t) => Number(t.project_id) === pid;
    }
  } else if (scope === 'team') {
    const teamId = Number(id);
    let teamName = teamId ? `Team ${teamId}` : 'Team';
    if (!Number.isNaN(teamId)) {
      try {
        const { data: teamRow, error: teamErr } = await supabase
          .from('teams')
          .select('team_id, team_name')
          .eq('team_id', teamId)
          .maybeSingle();
        if (!teamErr && teamRow && teamRow.team_name) teamName = teamRow.team_name;
      } catch (e) { /* ignore */ }
    }
    title = `Team Report — ${teamName}`;

    const { data: teamUsers } = await supabase.from('users').select('user_id').eq('team_id', teamId);
    const userIds = (teamUsers || []).map(u => u.user_id);
    filterFn = (t) => userIds.includes(t.owner_id) || (Array.isArray(t.members_id) && t.members_id.some(mid => userIds.includes(mid)));
  } else if (scope === 'department') {
    const deptId = Number(id);
    let deptName = deptId ? `Department ${deptId}` : 'Department';
    if (!Number.isNaN(deptId)) {
      try {
        const { data: deptRow, error: deptErr } = await supabase
          .from('departments')
          .select('department_id, department_name')
          .eq('department_id', deptId)
          .maybeSingle();
        if (!deptErr && deptRow && deptRow.department_name) deptName = deptRow.department_name;
      } catch (e) { /* ignore */ }
    }
    title = `Department Report — ${deptName}`;

    const { data: deptUsers } = await supabase.from('users').select('user_id').eq('department_id', deptId);
    const userIds = (deptUsers || []).map(u => u.user_id);
    filterFn = (t) => userIds.includes(t.owner_id) || (Array.isArray(t.members_id) && t.members_id.some(mid => userIds.includes(mid)));
  } else if (scope === 'user') {
    const uid = Number(id);
    let userName = uid ? `User ${uid}` : 'User';
    if (!Number.isNaN(uid)) {
      try {
        const { data: usr, error: uErr } = await supabase
          .from('users')
          .select('user_id, full_name')
          .eq('user_id', uid)
          .maybeSingle();
        if (!uErr && usr && usr.full_name) userName = usr.full_name;
      } catch (e) { /* ignore */ }
    }
    title = `User Report — ${userName}`;
    filterFn = (t) => t.owner_id === uid || t.assignee_id === uid || (Array.isArray(t.members_id) && t.members_id.includes(uid));
  } else {
    title = 'Company-wide Report';
    filterFn = (t) => true;
  }

  // date-aware filter wrapper
  const filterWithDates = (t) => {
    if (!filterFn(t)) return false;
    if (start && t.due_date && new Date(t.due_date) < start) return false;
    if (end && t.due_date && new Date(t.due_date) > end) return false;
    return true;
  };

  const tasks = await queryTasks(supabase, filterWithDates);

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;
  const ongoing = tasks.filter(t => t.status === 'ONGOING').length;
  const underReview = tasks.filter(t => t.status === 'UNDER_REVIEW').length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'COMPLETED').length;

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED' && t.created_at && t.updated_at);
  const avgDays = completedTasks.length
    ? (completedTasks.reduce((sum, t) => {
      const created = new Date(t.created_at);
      const updated = new Date(t.updated_at);
      return sum + ((updated - created) / (1000 * 60 * 60 * 24));
    }, 0) / completedTasks.length).toFixed(1)
    : null;

  const userIds = new Set();
  tasks.forEach(t => {
    if (t.owner_id) userIds.add(t.owner_id);
    if (t.assignee_id) userIds.add(t.assignee_id);
    if (Array.isArray(t.members_id)) t.members_id.forEach(m => userIds.add(m));
  });
  const userIdList = Array.from(userIds);
  let people = [];
  if (userIdList.length) {
    const { data: users } = await supabase.from('users').select('user_id, full_name, email').in('user_id', userIdList);
    if (users) people = users;
  }

  const userMap = {};
  people.forEach(u => { userMap[u.user_id] = `${u.full_name} (${u.email})`; });

  const sampleTasks = tasks.slice(0, 200).map(t => ({
    ...t,
    owner_name: userMap[t.owner_id],
    assignee_name: userMap[t.assignee_id],
    overdue: !!(t.due_date && new Date(t.due_date) < new Date() && t.status !== 'COMPLETED')
  }));

  const metrics = [
    { label: 'Total tasks', value: total },
    { label: 'Completed', value: completed },
    { label: 'In progress', value: ongoing },
    { label: 'Under review', value: underReview },
    { label: 'Overdue', value: overdue },
    { label: 'Avg time to complete (days)', value: avgDays !== null ? avgDays : 'N/A' },
    { label: 'People involved', value: people.length }
  ];

  const subtitleParts = [];
  if (startDate) subtitleParts.push(`From ${startDate}`);
  if (endDate) subtitleParts.push(`To ${endDate}`);
  const subtitle = subtitleParts.join(' - ');

  const buffer = await makeSimplePdfBuffer(title, subtitle, metrics, sampleTasks);
  return buffer;
}

module.exports = {
  generateReportBuffer,
  sanitizeFilename,
  makeSimplePdfBuffer
};