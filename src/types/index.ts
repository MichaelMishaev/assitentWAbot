// Core types for the WhatsApp Assistant Bot

export interface User {
  id: string;
  phone: string;
  username?: string;
  passwordHash: string;
  name: string;
  locale: string;
  timezone: string;
  prefsJsonb: UserPreferences;
  calendarProvider: 'LOCAL' | 'GOOGLE';
  createdAt: Date;
  updatedAt: Date;
}

export type MenuDisplayMode = 'always' | 'adaptive' | 'errors_only' | 'never';

export interface MorningNotificationPreferences {
  enabled: boolean; // Enable/disable morning notifications
  time: string; // HH:mm format (e.g., "08:00")
  days: number[]; // Days of week: 0=Sunday, 1=Monday, etc.
  includeMemos: boolean; // Include reminders/memos in summary
}

export interface UserPreferences {
  menuDisplayMode?: MenuDisplayMode;
  reminderLeadTimeMinutes?: number; // Minutes before event to send reminder (0-120)
  morningNotification?: MorningNotificationPreferences;
  [key: string]: any;
}

export interface UserProficiencyMetrics {
  totalMessages: number;
  nlpSuccessCount: number;
  nlpFailureCount: number;
  menuRequestCount: number;
  lastMenuRequestTime: Date | null;
  commandUsageCount: number;
  errorCount: number;
  sessionCount: number;
  firstMessageAt: Date;
  lastUpdated: Date;
}

export type ProficiencyLevel = 'novice' | 'intermediate' | 'expert';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  relation?: string;
  aliases: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EventComment {
  id: string;
  text: string;
  timestamp: string; // ISO 8601 format
  priority: 'normal' | 'high' | 'urgent';
  tags?: string[];
  reminderId?: string; // Reference to reminder if created from comment
}

export interface Event {
  id: string;
  userId: string;
  title: string;
  startTsUtc: Date;
  endTsUtc?: Date;
  rrule?: string;
  location?: string;
  notes?: EventComment[]; // Changed from string to EventComment array
  source: string;
  confidence?: number;
  externalRefJsonb?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  dueTsUtc: Date;
  rrule?: string;
  status: 'active' | 'sent' | 'cancelled' | 'failed';
  eventId?: string;
  externalRefJsonb?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueTsUtc?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  userId: string;
  state: ConversationState;
  context: Record<string, any>;
  lastActivity: Date;
  expiresAt: Date;
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string, timestamp: Date }>;
}

export enum ConversationState {
  IDLE = 'IDLE',
  MAIN_MENU = 'MAIN_MENU',
  ADDING_EVENT_NAME = 'ADDING_EVENT_NAME',
  ADDING_EVENT_DATE = 'ADDING_EVENT_DATE',
  ADDING_EVENT_TIME = 'ADDING_EVENT_TIME',
  ADDING_EVENT_LOCATION = 'ADDING_EVENT_LOCATION',
  ADDING_EVENT_CONFIRM = 'ADDING_EVENT_CONFIRM',
  ADDING_EVENT_CONFLICT_CONFIRM = 'ADDING_EVENT_CONFLICT_CONFIRM',
  CONFIRMING_DATE_MISMATCH = 'CONFIRMING_DATE_MISMATCH',
  ADDING_REMINDER_TITLE = 'ADDING_REMINDER_TITLE',
  ADDING_REMINDER_DATETIME = 'ADDING_REMINDER_DATETIME',
  ADDING_REMINDER_RECURRENCE = 'ADDING_REMINDER_RECURRENCE',
  ADDING_REMINDER_CONFIRM = 'ADDING_REMINDER_CONFIRM',
  LISTING_EVENTS = 'LISTING_EVENTS',
  LISTING_EVENTS_SEARCH = 'LISTING_EVENTS_SEARCH',
  LISTING_EVENTS_ACTION = 'LISTING_EVENTS_ACTION',
  EDITING_EVENT = 'EDITING_EVENT',
  EDITING_EVENT_FIELD = 'EDITING_EVENT_FIELD',
  DELETING_EVENT = 'DELETING_EVENT',
  DELETING_EVENT_SEARCH = 'DELETING_EVENT_SEARCH',
  DELETING_EVENT_CONFIRM = 'DELETING_EVENT_CONFIRM',
  DELETING_ALL_EVENTS_CONFIRM = 'DELETING_ALL_EVENTS_CONFIRM',
  LISTING_REMINDERS = 'LISTING_REMINDERS',
  CANCELLING_REMINDER = 'CANCELLING_REMINDER',
  CANCELLING_REMINDER_CONFIRM = 'CANCELLING_REMINDER_CONFIRM',
  DELETING_REMINDER_SELECT = 'DELETING_REMINDER_SELECT',
  DELETING_REMINDER_CONFIRM = 'DELETING_REMINDER_CONFIRM',
  UPDATING_REMINDER_SELECT = 'UPDATING_REMINDER_SELECT',
  UPDATING_REMINDER_OCCURRENCE = 'UPDATING_REMINDER_OCCURRENCE',
  UPDATING_REMINDER_CONFIRM = 'UPDATING_REMINDER_CONFIRM',
  SETTINGS_MENU = 'SETTINGS_MENU',
  SETTINGS_LANGUAGE = 'SETTINGS_LANGUAGE',
  SETTINGS_TIMEZONE = 'SETTINGS_TIMEZONE',
  SETTINGS_MENU_DISPLAY = 'SETTINGS_MENU_DISPLAY',
  SETTINGS_REMINDER_TIME = 'SETTINGS_REMINDER_TIME',
  TASKS_MENU = 'TASKS_MENU',
  ADDING_TASK_TITLE = 'ADDING_TASK_TITLE',
  ADDING_TASK_DESCRIPTION = 'ADDING_TASK_DESCRIPTION',
  ADDING_TASK_PRIORITY = 'ADDING_TASK_PRIORITY',
  ADDING_TASK_DUE_DATE = 'ADDING_TASK_DUE_DATE',
  ADDING_TASK_CONFIRM = 'ADDING_TASK_CONFIRM',
  LISTING_TASKS = 'LISTING_TASKS',
  MARKING_TASK_DONE = 'MARKING_TASK_DONE',
  DELETING_TASK = 'DELETING_TASK',
  DELETING_TASK_CONFIRM = 'DELETING_TASK_CONFIRM',
}

export interface AuthState {
  userId: string | null;
  phone: string;
  authenticated: boolean;
  failedAttempts: number;
  lockoutUntil: Date | null;
  registrationStep?: 'name' | 'complete';
  tempData?: {
    name?: string;
  };
}

export interface RateLimitInfo {
  count: number;
  resetAt: Date;
}

export interface QualityMetrics {
  messagesSent: number;
  messagesRead: number;
  blockedByUser: boolean;
  lastInteraction: Date;
}
