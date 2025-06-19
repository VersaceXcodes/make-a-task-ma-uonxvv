import create from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

// Types for state variables
export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  workspace_id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export interface Task {
  task_id: string;
  workspace_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  is_favorited: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  comments: Comment[];
  attachments: Attachment[];
  activity_log: Activity[];
}

export interface Comment {
  comment_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  mentions: string[];
  user_name?: string;
}

export interface Attachment {
  attachment_id: string;
  file_url: string;
  filename: string;
  created_at: string;
}

export interface Activity {
  activity_id: string;
  user_id: string;
  action_type: string;
  description: string;
  timestamp: string;
}

export interface Notification {
  notification_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  notifications_enabled: boolean;
  language: string;
}

// Store shape
interface AppState {
  // Authentication
  auth_token: string | null;
  set_auth_token: (token: string | null) => void;

  // User profile
  current_user: UserProfile | null;
  set_current_user: (user: UserProfile | null) => void;

  // Workspaces
  workspaces: Workspace[];
  set_workspaces: (spaces: Workspace[]) => void;

  // Active workspace
  selected_workspace: Workspace | null;
  set_selected_workspace: (workspace: Workspace | null) => void;

  // Tasks
  tasks: Task[];
  set_tasks: (tasks: Task[]) => void;

  // Current task details
  current_task: Task | null;
  set_current_task: (task: Task | null) => void;

  // Notifications
  notifications: Notification[];
  set_notifications: (notifications: Notification[]) => void;

  // User preferences
  user_preferences: UserPreferences;
  set_user_preferences: (prefs: UserPreferences) => void;

  // WebSocket client
  socket: Socket | null;
  socket_connected: boolean;
  init_socket: (token?: string) => Promise<void>;
  disconnect_socket: () => void;

  // Realtime event handlers (internal)
  handle_notification_update: (payload: Notification) => void;
  handle_comment_created: (payload: Comment & { task_id: string }) => void;
  handle_task_status_updated: (payload: { task_id: string; status: string; timestamp: string }) => void;
  handle_task_reordered: (payload: any) => void;
  handle_activity_stream: (payload: Activity) => void;
}

// Create the store with persistence to localStorage
export const use_app_store = create<AppState>()(
  persist(
    (set, get) => ({
      // Initialize state
      auth_token: null,
      current_user: null,
      workspaces: [],
      selected_workspace: null,
      tasks: [],
      current_task: null,
      notifications: [],
      user_preferences: {
        theme: 'light',
        notifications_enabled: true,
        language: 'en',
      },

      socket: null,
      socket_connected: false,

      // Setters
      set_auth_token: (token) => set({ auth_token: token }),
      set_current_user: (user) => set({ current_user: user }),
      set_workspaces: (spaces) => set({ workspaces: spaces }),
      set_selected_workspace: (workspace) => set({ selected_workspace: workspace }),
      set_tasks: (tasks) => set({ tasks }),
      set_current_task: (task) => set({ current_task: task }),
      set_notifications: (notifications) => set({ notifications }),
      set_user_preferences: (prefs) => set({ user_preferences: prefs }),

      // Initialize WebSocket connection and setup event listeners
      init_socket: async (token?: string) => {
        const currentToken = token || get().auth_token;
        if (!currentToken) return;
        // create new socket if not exists or disconnect existing
        if (get().socket) {
          get().socket!.disconnect();
        }
        const socket = io('ws://localhost:3000', {
          auth: { token: currentToken },
        });
        set({ socket });

        socket.on('connect', () => {
          set({ socket_connected: true });
        });
        socket.on('disconnect', () => {
          set({ socket_connected: false });
        });

        // Register event handlers
        socket.on('notification_update', (payload: Notification) => {
          get().handle_notification_update(payload);
        });
        socket.on('comment_created', (payload: any & { task_id: string }) => {
          get().handle_comment_created(payload);
        });
        socket.on('task_status_updated', (payload: { task_id: string; status: string; timestamp: string }) => {
          get().handle_task_status_updated(payload);
        });
        socket.on('task_reorder', (payload: any) => {
          get().handle_task_reordered(payload);
        });
        socket.on('activity/stream', (payload: Activity) => {
          get().handle_activity_stream(payload);
        });
      },

      disconnect_socket: () => {
        const socket = get().socket;
        if (socket) {
          socket.disconnect();
          set({ socket: null, socket_connected: false });
        }
      },

      // Handlers for WebSocket events
      handle_notification_update: (payload: Notification) => {
        const notifications = get().notifications.slice();
        // update or add
        const index = notifications.findIndex(n => n.notification_id === payload.notification_id);
        if (index >= 0) {
          notifications[index] = payload;
        } else {
          notifications.push(payload);
        }
        get().set_notifications(notifications);
      },

      handle_comment_created: (payload: Comment & { task_id: string }) => {
        const { task_id } = payload;
        if (!get().current_task || get().current_task.task_id !== task_id) return;
        const current_task = { ...get().current_task };
        current_task.comments = [...current_task.comments, payload];
        get().set_current_task(current_task);
      },

      handle_task_status_updated: (payload: { task_id: string; status: string; timestamp: string }) => {
        // Update in tasks list if present
        const tasks = get().tasks.slice();
        const index = tasks.findIndex(t => t.task_id === payload.task_id);
        if (index >= 0) {
          const task = { ...tasks[index], status: payload.status, updated_at: payload.timestamp };
          tasks[index] = task;
          get().set_tasks(tasks);
        }
        // Update current_task if it's the same task
        if (get().current_task && get().current_task.task_id === payload.task_id) {
          get().set_current_task({ ...get().current_task, status: payload.status, updated_at: payload.timestamp });
        }
      },

      handle_task_reordered: (payload: any) => {
        // For simplicity, assume payload contains task_id and new_position; implementation depends on UI
        // For now, no change in state unless specific data provided
        // Can implement logic if needed
      },

      handle_activity_stream: (payload: Activity) => {
        // Could push to activity log array if we keep one
        // For now, not storing activity stream in global state
      },

    }),
    {
      name: 'make_a_task_ma_state', // unique storage name
    }
  )
);
