-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    avatar_url VARCHAR(512) NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Viewer', 'Team Member', 'Admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create password_resets table
CREATE TABLE password_resets (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, token)
);

-- Create workspaces table
CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create workspace_users table
CREATE TABLE workspace_users (
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Viewer', 'Team Member', 'Admin')),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id)
);

-- Create tasks table
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    due_date TIMESTAMP NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create task_tags table
CREATE TABLE task_tags (
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    tag VARCHAR(100) NOT NULL,
    PRIMARY KEY (task_id, tag)
);

-- Create task_attachments table
CREATE TABLE task_attachments (
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    file_url VARCHAR(512) NOT NULL,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, file_url)
);

-- Create task_favorites table
CREATE TABLE task_favorites (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, task_id)
);

-- Create task_activity table
CREATE TABLE task_activity (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSON NULL
);

-- Create comments table
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    mentions JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notifications table
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create saved_filters table
CREATE TABLE saved_filters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    criteria JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create exports table
CREATE TABLE exports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    format VARCHAR(10) NOT NULL CHECK (format IN ('CSV', 'PDF')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
);

-- Seed example data for users
INSERT INTO users (id, email, password_hash, name, avatar_url, role, created_at, updated_at) VALUES
('user1', 'alice@example.com', 'hashed_password_1', 'Alice Smith', 'https://picsum.photos/seed/001/100/100', 'Admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('user2', 'bob@example.com', 'hashed_password_2', 'Bob Johnson', 'https://picsum.photos/seed/002/100/100', 'Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('user3', 'carol@example.com', 'hashed_password_3', 'Carol Williams', 'https://picsum.photos/seed/003/100/100', 'Viewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('user4', 'dave@example.com', 'hashed_password_4', 'Dave Brown', 'https://picsum.photos/seed/004/100/100', 'Team Member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('user5', 'eve@example.com', 'hashed_password_5', 'Eve Davis', 'https://picsum.photos/seed/005/100/100', 'Admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed example data for workspaces
INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES
('workspace1', 'Project Alpha', 'user1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('workspace2', 'Team Beta', 'user5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed example data for workspace_users
INSERT INTO workspace_users (workspace_id, user_id, role, added_at) VALUES
('workspace1', 'user1', 'Admin', CURRENT_TIMESTAMP),
('workspace1', 'user2', 'Team Member', CURRENT_TIMESTAMP),
('workspace1', 'user3', 'Viewer', CURRENT_TIMESTAMP),
('workspace2', 'user5', 'Admin', CURRENT_TIMESTAMP),
('workspace2', 'user4', 'Team Member', CURRENT_TIMESTAMP);

-- Seed example data for tasks
INSERT INTO tasks (id, workspace_id, created_by, assigned_to, title, description, due_date, priority, status, created_at, updated_at) VALUES
('task1', 'workspace1', 'user1', 'user2', 'Design UI mockups', 'Create initial UI mockups for the app', CURRENT_TIMESTAMP + INTERVAL '7 days', 'High', 'In Progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('task2', 'workspace1', 'user2', 'user3', 'Write project documentation', 'Draft the project documentation and gather feedback', CURRENT_TIMESTAMP + INTERVAL '14 days', 'Medium', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('task3', 'workspace2', 'user5', 'user4', 'Set up onboarding meeting', 'Organize initial onboarding meeting for new team members', CURRENT_TIMESTAMP + INTERVAL '3 days', 'Low', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('task4', 'workspace2', 'user4', 'user5', 'Review project plan', 'Review the draft project plan and suggest edits', CURRENT_TIMESTAMP + INTERVAL '5 days', 'High', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed example data for task_tags
INSERT INTO task_tags (task_id, tag) VALUES
('task1', 'UI'),
('task1', 'Design'),
('task2', 'Documentation'),
('task3', 'Onboarding'),
('task4', 'Review');

-- Seed example data for task_attachments
INSERT INTO task_attachments (task_id, file_url, added_by, added_at) VALUES
('task1', 'https://picsum.photos/seed/010/200/200', 'user2', CURRENT_TIMESTAMP),
('task2', 'https://picsum.photos/seed/011/200/200', 'user3', CURRENT_TIMESTAMP),
('task3', 'https://picsum.photos/seed/012/200/200', 'user4', CURRENT_TIMESTAMP);

-- Seed example data for task_favorites
INSERT INTO task_favorites (user_id, task_id) VALUES
('user2', 'task1'),
('user3', 'task2'),
('user4', 'task3');

-- Seed example data for task_activity
INSERT INTO task_activity (task_id, user_id, action, timestamp, details) VALUES
('task1', 'user1', 'created', CURRENT_TIMESTAMP, NULL),
('task1', 'user2', 'updated', CURRENT_TIMESTAMP, '{"field": "status", "old_value": "Pending", "new_value": "In Progress"}'),
('task2', 'user2', 'created', CURRENT_TIMESTAMP, NULL),
('task3', 'user5', 'created', CURRENT_TIMESTAMP, NULL),
('task4', 'user4', 'created', CURRENT_TIMESTAMP, NULL);

-- Seed example data for comments
INSERT INTO comments (task_id, user_id, content, mentions, created_at, updated_at) VALUES
('task1', 'user2', 'Please review the mockups and give feedback.', '{"mentioned_users": ["user3"]}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('task2', 'user3', 'Draft looks good, but needs some revisions.', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('task3', 'user5', 'Scheduling the onboarding meeting for next week.', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed example data for notifications
INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES
('user2', 'assignment', 'You have been assigned a new task: Design UI mockups.', FALSE, CURRENT_TIMESTAMP),
('user3', 'comment', 'New comment on your task: Draft looks good.', FALSE, CURRENT_TIMESTAMP),
('user5', 'due_date', 'Task Set up onboarding meeting is due tomorrow.', FALSE, CURRENT_TIMESTAMP);

-- Seed example data for saved_filters
INSERT INTO saved_filters (user_id, name, criteria, created_at) VALUES
('user2', 'High Priority Tasks', '{"status": "Pending", "priority": "High"}', CURRENT_TIMESTAMP),
('user3', 'My Tasks', '{"assigned_to": "user3"}', CURRENT_TIMESTAMP);

-- Seed example data for exports
INSERT INTO exports (user_id, format, requested_at, completed_at) VALUES
('user1', 'CSV', CURRENT_TIMESTAMP, NULL),
('user5', 'PDF', CURRENT_TIMESTAMP, NULL);