import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import path from 'path';
import { fileURLToPath } from 'url';

import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

// __dirname setup for static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure env variables
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const DATABASE_URL = process.env.DATABASE_URL;

// Initialize PostgreSQL pool
const pool = new Pool(
  DATABASE_URL
    ? { connectionString: DATABASE_URL, ssl: { require: true } }
    : {
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        port: Number(process.env.PGPORT || 5432),
        ssl: { require: true },
      }
);

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user; // { user_id, role, email, name }
    next();
  });
}

// Role check middleware
function authorizeRoles(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

// Utility functions
async function queryDB(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// ===================== REST API Endpoints =====================

// ----------- User Registration -----------
// POST /users/register
app.post('/users/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const userRole = role || 'Viewer';

  // Check for existing email
  const checkRes = await queryDB('SELECT id FROM users WHERE email = $1', [email]);
  if (checkRes.rows.length > 0)
    return res.status(409).json({ message: 'Email already registered' });

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const insertRes = await queryDB(
      `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, name, email, avatar_url, role, created_at, updated_at`,
      [email, hashedPassword, name, userRole]
    );
    res.json(insertRes.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error registering user', error: err.message });
  }
});

// ----------- User Login -----------
// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const userRes = await queryDB('SELECT * FROM users WHERE email = $1', [email]);
  if (userRes.rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password' });
  const user = userRes.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ message: 'Invalid email or password' });
  const token = jwt.sign(
    {
      user_id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user_id: user.id, name: user.name, role: user.role });
});

// ----------- Get User Profile -----------
// GET /users/:user_id
app.get('/users/:user_id', authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  // Convert to number for comparison if IDs are integers
  const userIdParam = Number(user_id);
  if (req.user.user_id !== userIdParam && req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const result = await queryDB('SELECT * FROM users WHERE id = $1', [userIdParam]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err.message });
  }
});

// ----------- Create Workspace -----------
// POST /workspaces
app.post('/workspaces', authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query('BEGIN');
    const insertWs = await queryDB(
      `INSERT INTO workspaces (name, owner_id, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, name, owner_id, created_at, updated_at`,
      [name, req.user.user_id]
    );
    const workspace_id = insertWs.rows[0].id;

    // Add owner as admin to workspace_users
    await queryDB(
      `INSERT INTO workspace_users (workspace_id, user_id, role, added_at)
       VALUES ($1, $2, 'Admin', CURRENT_TIMESTAMP)`,
      [workspace_id, req.user.user_id]
    );
    await pool.query('COMMIT');
    res.json(insertWs.rows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error creating workspace', error: err.message });
  }
});

// ----------- Get ALL Workspaces -----------
// GET /workspaces
app.get('/workspaces', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id;
  try {
    const result = await queryDB(
      `SELECT w.id as workspace_id, w.name, w.owner_id, w.created_at, w.updated_at, 
      CASE WHEN wu.workspace_id IS NOT NULL THEN 'private' ELSE 'public' END as visibility
     FROM workspaces w
     LEFT JOIN workspace_users wu ON w.id = wu.workspace_id AND wu.user_id = $1`,
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching workspaces', error: err.message });
  }
});

// ----------- Get Details of a Workspace -----------
// GET /workspaces/:workspace_id
app.get('/workspaces/:workspace_id', authenticateToken, async (req, res) => {
  const { workspace_id } = req.params;
  const user_id = req.user.user_id;
  try {
    const wsRes = await queryDB(
      `SELECT * FROM workspaces WHERE id = $1`,
      [workspace_id]
    );
    if (wsRes.rows.length === 0) return res.status(404).json({ message: 'Workspace not found' });
    const accessRes = await queryDB(
      `SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2`,
      [workspace_id, user_id]
    );
    if (accessRes.rows.length === 0 && wsRes.rows[0].owner_id !== user_id)
      return res.status(403).json({ message: 'Access denied' });

    // Get members
    const membersRes = await queryDB(
      `SELECT u.id as user_id, u.name, u.avatar_url, wu.role
     FROM users u
     JOIN workspace_users wu ON u.id = wu.user_id
     WHERE wu.workspace_id = $1`,
      [workspace_id]
    );

    res.json({
      workspace_id,
      name: wsRes.rows[0].name,
      owner_id: wsRes.rows[0].owner_id,
      members: membersRes.rows,
      created_at: wsRes.rows[0].created_at,
      updated_at: wsRes.rows[0].updated_at,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching workspace details', error: err.message });
  }
});

// ----------- Create Task -----------
// POST /tasks
app.post('/tasks', authenticateToken, async (req, res) => {
  const {
    workspace_id,
    title,
    description,
    due_date,
    priority,
    status,
    assigned_to,
    tags,
    is_favorited
  } = req.body;

  // Validate workspace access
  let hasAccess = false;
  try {
    const accessRes = await queryDB(
      'SELECT role FROM workspace_users WHERE workspace_id = $1 AND user_id = $2',
      [workspace_id, req.user.user_id]
    );
    if (accessRes.rows.length > 0) {
      hasAccess = true;
    } else {
      const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [workspace_id]);
      if (wsOwnerRes.rows.length > 0 && wsOwnerRes.rows[0].owner_id === req.user.user_id) {
        hasAccess = true;
      }
    }
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to workspace' });
    }
  } catch (err) {
    return res.status(500).json({ message: 'Error verifying workspace access', error: err.message });
  }

  const task_id = uuidv4();
  const now = new Date().toISOString();
  const created_at = now;
  const updated_at = now;
  const taskStatus = status || 'Pending';
  const taskPriority = priority || 'Medium';

  try {
    await pool.query('BEGIN');
    // Insert task with validation for due_date
    const validDueDate = due_date && !isNaN(Date.parse(due_date)) ? due_date : null;
    const insertTaskRes = await queryDB(
      `INSERT INTO tasks (id, workspace_id, created_by, assigned_to, title, description, due_date, priority, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [task_id, workspace_id, req.user.user_id, assigned_to || null, title, description || null, validDueDate, taskPriority, taskStatus]
    );
    // Handle tags
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        await queryDB(
          `INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [task_id, tag]
        );
      }
    }
    await pool.query('COMMIT');
    res.json(insertTaskRes.rows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error creating task', error: err.message });
  }
});

// ----------- Get Task Details -----------
// GET /tasks/:task_id
app.get('/tasks/:task_id', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  try {
    const taskRes = await queryDB(
      `SELECT t.*, u.id as created_by_user, u.name as created_by_name, a.id as assigned_to_user, a.name as assigned_to_name, w.id as workspace_id
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       LEFT JOIN workspaces w ON t.workspace_id = w.id
       WHERE t.id = $1`,
      [task_id]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });

    const task = taskRes.rows[0];
    // Authorization check
    const accessRes = await queryDB(
      'SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2',
      [task.workspace_id, req.user.user_id]
    );
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (accessRes.rows.length === 0 && (wsOwnerRes.rows.length === 0 || wsOwnerRes.rows[0].owner_id !== req.user.user_id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Get tags
    const tagsRes = await queryDB('SELECT tag FROM task_tags WHERE task_id = $1', [task_id]);
    const tags = tagsRes.rows.map(r => r.tag);
    // Get comments
    const commentsRes = await queryDB(
      'SELECT c.id as comment_id, c.content, c.mentions, c.created_at, c.updated_at, u.id as user_id, u.name
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1',
      [task_id]
    );
    // Get attachments
    const attachmentsRes = await queryDB(
      'SELECT id as attachment_id, file_url, filename, created_at FROM task_attachments WHERE task_id = $1',
      [task_id]
    );
    // Get activity logs
    const activityRes = await queryDB(
      'SELECT id as activity_id, user_id, action, description, timestamp FROM task_activity WHERE task_id = $1 ORDER BY timestamp DESC',
      [task_id]
    );

    res.json({
      task_id,
      workspace_id: task.workspace_id,
      created_by: task.created_by_user,
      assigned_to: task.assigned_to_user,
      title: task.title,
      description: task.description,
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
      is_favorited: false, // For simplicity, not implementing favorites in this mockup
      tags,
      comments: commentsRes.rows,
      attachments: attachmentsRes.rows,
      activity_log: activityRes.rows,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching task details', error: err.message });
  }
});

// ----------- Update Task -----------
// PUT /tasks/:task_id
app.put('/tasks/:task_id', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  const {
    title,
    description,
    due_date,
    priority,
    status,
    assigned_to,
    tags,
    is_favorited
  } = req.body;
  try {
    const taskRes = await queryDB('SELECT * FROM tasks WHERE id = $1', [task_id]);
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRes.rows[0];
    // Check access
    const accessRes = await queryDB('SELECT role FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [task.workspace_id, req.user.user_id]);
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (accessRes.rows.length === 0 && (wsOwnerRes.rows.length === 0 || wsOwnerRes.rows[0].owner_id !== req.user.user_id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Prepare update fields
    const fields = [];
    const params = [];
    let idx = 1;
    if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
    if (due_date !== undefined) { 
      const validDueDate = due_date && !isNaN(Date.parse(due_date)) ? due_date : null;
      fields.push(`due_date = $${idx++}`); params.push(validDueDate); 
    }
    if (priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(priority); }
    if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
    if (assigned_to !== undefined) { fields.push(`assigned_to = $${idx++}`); params.push(assigned_to); }
    // Update timestamp
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    if (fields.length > 0) {
      await queryDB(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, [...params, task_id]);
    }
    // Handle tags
    if (tags && Array.isArray(tags)) {
      await queryDB(`DELETE FROM task_tags WHERE task_id = $1`, [task_id]);
      for (const tag of tags) {
        await queryDB(
          `INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [task_id, tag]
        );
      }
    }
    // Return updated task
    const updatedTaskRes = await queryDB(`SELECT * FROM tasks WHERE id = $1`, [task_id]);
    res.json(updatedTaskRes.rows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error updating task', error: err.message });
  }
});

// ----------- Delete Task -----------
// DELETE /tasks/:task_id
app.delete('/tasks/:task_id', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  try {
    const taskRes = await queryDB('SELECT * FROM tasks WHERE id = $1', [task_id]);
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRes.rows[0];
    // Check permission
    const accessRes = await queryDB('SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [task.workspace_id, req.user.user_id]);
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (req.user.role !== 'Admin' && (accessRes.rows.length === 0 || wsOwnerRes.rows.length === 0 || wsOwnerRes.rows[0].owner_id !== req.user.user_id))
      return res.status(403).json({ message: 'Forbidden' });
    await queryDB('DELETE FROM tasks WHERE id = $1', [task_id]);
    res.json({ message: 'Task deleted successfully', task_id });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting task', error: err.message });
  }
});

// ----------- Add Comment -----------
// POST /tasks/:task_id/comments
app.post('/tasks/:task_id/comments', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  const { content, mentions } = req.body;
  try {
    const taskRes = await queryDB('SELECT * FROM tasks WHERE id = $1', [task_id]);
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRes.rows[0];
    const accessRes = await queryDB('SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [task.workspace_id, req.user.user_id]);
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (req.user.role !== 'Admin' && accessRes.rows.length === 0 && wsOwnerRes.rows[0].owner_id !== req.user.user_id)
      return res.status(403).json({ message: 'Access denied' });
    const comment_id = uuidv4();
    const now = new Date().toISOString();
    const mentionsJson = mentions || [];
    const insertRes = await queryDB(
      `INSERT INTO comments (task_id, user_id, content, mentions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [task_id, req.user.user_id, content, JSON.stringify(mentionsJson)]
    );
    // TODO: Trigger WebSocket comment_created event here after insert
    res.json({
      comment_id: insertRes.rows[0].id,
      task_id,
      author_id: req.user.user_id,
      content,
      mentions: mentionsJson,
      created_at: now,
      updated_at: now
    });
  } catch (err) {
    res.status(500).json({ message: 'Error adding comment', error: err.message });
  }
});

// ----------- Upload Attachment -----------
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });

// For simplicity, assume upload API returns URL based on filename
app.post('/tasks/:task_id/attachments', authenticateToken, upload.single('file'), async (req, res) => {
  const { task_id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No file uploaded' });
  // Here, in real implementation, upload file to storage provider and get URL
  const file_url = `/storage/${file.filename}`; // placeholder
  const filename = file.originalname;
  const uploaded_at = new Date().toISOString();
  try {
    const taskRes = await queryDB('SELECT * FROM tasks WHERE id = $1', [task_id]);
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRes.rows[0];
    const accessRes = await queryDB('SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [task.workspace_id, req.user.user_id]);
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (req.user.role !== 'Admin' && (accessRes.rows.length === 0 || wsOwnerRes.rows.length === 0 || wsOwnerRes.rows[0].owner_id !== req.user.user_id))
      return res.status(403).json({ message: 'Access denied' });
    const attachment_id = uuidv4();
    await queryDB(
      `INSERT INTO task_attachments (task_id, file_url, added_by, added_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [task_id, file_url, req.user.user_id]
    );
    res.json({
      attachment_id,
      task_id,
      file_url,
      filename,
      uploaded_at
    });
  } catch (err) {
    res.status(500).json({ message: 'Error uploading attachment', error: err.message });
  }
});

// ----------- Favorite Task -----------
app.post('/tasks/:task_id/favorite', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  try {
    const existing = await queryDB('SELECT * FROM task_favorites WHERE user_id=$1 AND task_id=$2', [req.user.user_id, task_id]);
    if (existing.rows.length === 0) {
      await queryDB('INSERT INTO task_favorites (user_id, task_id) VALUES ($1, $2)', [req.user.user_id, task_id]);
    }
    res.json({ message: 'Task added to favorites' });
  } catch (err) {
    res.status(500).json({ message: 'Error favoriting task', error: err.message });
  }
});

// ----------- Remove Favorite -----------
app.delete('/tasks/:task_id/favorite', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  try {
    await queryDB('DELETE FROM task_favorites WHERE user_id=$1 AND task_id=$2', [req.user.user_id, task_id]);
    res.json({ message: 'Task removed from favorites' });
  } catch (err) {
    res.status(500).json({ message: 'Error removing favorite', error: err.message });
  }
});

// ----------- Change Task Status -----------
app.post('/tasks/:task_id/status', authenticateToken, async (req, res) => {
  const { task_id } = req.params;
  const { status } = req.body;
  const validStatuses = ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ message: 'Invalid status' });
  try {
    const taskRes = await queryDB('SELECT * FROM tasks WHERE id = $1', [task_id]);
    if (taskRes.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    const task = taskRes.rows[0];
    const accessRes = await queryDB('SELECT * FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [task.workspace_id, req.user.user_id]);
    const wsOwnerRes = await queryDB('SELECT owner_id FROM workspaces WHERE id = $1', [task.workspace_id]);
    if (req.user.role !== 'Admin' && (accessRes.rows.length === 0 || wsOwnerRes.rows.length === 0 || wsOwnerRes.rows[0].owner_id !== req.user.user_id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await queryDB('UPDATE tasks SET status=$1, updated_at = CURRENT_TIMESTAMP WHERE id=$2', [status, task_id]);
    const activity_id = uuidv4();
    await queryDB(
      `INSERT INTO task_activity (task_id, user_id, action, description, timestamp)
       VALUES ($1, $2, 'status_changed', $3, CURRENT_TIMESTAMP)`,
      [task_id, req.user.user_id, `Status changed to ${status}`]
    );
    res.json({ task_id, status, updated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
});

// ----------- Search Tasks -----------
// GET /search/tasks
app.get('/search/tasks', authenticateToken, async (req, res) => {
  const { keyword, status, priority, tags, due_start, due_end } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  // Join condition for tags
  let joinTags = '';
  if (tags) {
    joinTags = `JOIN task_tags tt ON t.id = tt.task_id`;
    conditions.push(`tt.tag = ANY($${idx++})`);
    params.push([tags].flat());
  }

  if (keyword) {
    conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
    params.push(`%${keyword}%`);
    idx++;
  }
  if (status) {
    conditions.push(`t.status = $${idx++}`);
    params.push(status);
  }
  if (priority) {
    conditions.push(`t.priority = $${idx++}`);
    params.push(priority);
  }
  if (due_start) {
    conditions.push(`t.due_date >= $${idx++}`);
    params.push(due_start);
  }
  if (due_end) {
    conditions.push(`t.due_date <= $${idx++}`);
    params.push(due_end);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const queryText = `
    SELECT DISTINCT t.id as task_id, t.title, t.description, t.due_date, t.priority, t.status,
           ARRAY_AGG(tt.tag) AS tags
    FROM tasks t
    ${joinTags}
    ${whereClause}
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `;

  const result = await queryDB(queryText, params);
  res.json(result.rows);
});

// ----------- Export Tasks -----------
// GET /export/tasks
app.get('/export/tasks', authenticateToken, async (req, res) => {
  const { format } = req.query; // 'CSV' or 'PDF'
  const exportId = uuidv4();

  // Insert into exports table
  await queryDB(
    `INSERT INTO exports (id, user_id, format, requested_at, completed_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL)`,
    [exportId, req.user.user_id, format]
  );

  // For brevity, skipping actual background job, respond immediately
  res.json({ export_id: exportId, status: 'pending', download_url: null });
});

// =================== WebSocket & Event Broadcast ===================

import http from 'http';
import { Server } from 'socket.io';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // for testing, restrict in production
  },
});

// Helper function for broadcasting
function broadcastEvent(channel, message) {
  io.of('/').to(channel).emit(channel, message);
}

// Load all connections
io.on('connection', (socket) => {
  // Assume token sent in query for auth
  const token = socket.handshake.auth.token;
  if (!token) {
    socket.disconnect();
    return;
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      socket.disconnect();
      return;
    }
    socket.data.user = user;

    // Join channels/rooms based on user subscription
    // For simplicity, join a room per user for personal notifications
    socket.join(`user_${user.user_id}`);

    // Subscribe to relevant channels
    // No real subscription here; broadcasting is global
  });
});

// Example events (simulate on server-side API triggers):
async function broadcastTaskStatusUpdate(task_id, new_status) {
  const timestamp = new Date().toISOString();
  const payload = { task_id, new_status, timestamp };
  broadcastEvent('task/status/updated', payload);
}

async function broadcastCommentCreated(comment) {
  const payload = comment; // comment object with id, task_id, user_id, content, mentions, created_at
  broadcastEvent('task/comment/new', payload);
}

async function broadcastAttachmentUploaded(attachment) {
  const payload = attachment; // attachment object with id, task_id, file_url, filename, uploaded_by, uploaded_at
  broadcastEvent('task/attachment/uploaded', payload);
}

async function broadcastTaskReordered(reorderData) {
  broadcastEvent('task/reorder', reorderData);
}

async function broadcastActivityStream(activity) {
  broadcastEvent('activity/stream', activity);
}

// The above functions should be called after respective DB operations in real implementation

// =================== Server Startup ===================

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// =================== Static Files & Catch-all ===================
// This is included as per instructions to serve frontend and catch SPAs
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});