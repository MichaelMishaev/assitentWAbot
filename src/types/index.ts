// Core types for the WhatsApp Assistant Bot

export interface User {
  id: string;
  phone: string;
  username?: string;
  passwordHash: string;
  name: string;
  locale: string;
  timezone: string;
  prefsJsonb: Record<string, any>;
  calendarProvider: 'LOCAL' | 'GOOGLE';
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  userId: string;
  name: string;
  relation?: string;
  aliases: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  userId: string;
  title: string;
  startTsUtc: Date;
  endTsUtc?: Date;
  rrule?: string;
  location?: string;
  notes?: string;
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
  LISTING_REMINDERS = 'LISTING_REMINDERS',
  CANCELLING_REMINDER = 'CANCELLING_REMINDER',
  CANCELLING_REMINDER_CONFIRM = 'CANCELLING_REMINDER_CONFIRM',
  ADDING_CONTACT = 'ADDING_CONTACT',
  ADDING_CONTACT_NAME = 'ADDING_CONTACT_NAME',
  ADDING_CONTACT_PHONE = 'ADDING_CONTACT_PHONE',
  ADDING_CONTACT_RELATION = 'ADDING_CONTACT_RELATION',
  ADDING_CONTACT_ALIASES = 'ADDING_CONTACT_ALIASES',
  ADDING_CONTACT_CONFIRM = 'ADDING_CONTACT_CONFIRM',
  LISTING_CONTACTS = 'LISTING_CONTACTS',
  DELETING_CONTACT = 'DELETING_CONTACT',
  SETTINGS_MENU = 'SETTINGS_MENU',
  SETTINGS_LANGUAGE = 'SETTINGS_LANGUAGE',
  SETTINGS_TIMEZONE = 'SETTINGS_TIMEZONE',
  DRAFT_MESSAGE = 'DRAFT_MESSAGE',
  DRAFT_MESSAGE_RECIPIENT = 'DRAFT_MESSAGE_RECIPIENT',
  DRAFT_MESSAGE_CONTENT = 'DRAFT_MESSAGE_CONTENT',
  DRAFT_MESSAGE_CONFIRM = 'DRAFT_MESSAGE_CONFIRM',
  TASKS_MENU = 'TASKS_MENU',
}

export interface AuthState {
  userId: string | null;
  phone: string;
  authenticated: boolean;
  failedAttempts: number;
  lockoutUntil: Date | null;
  registrationStep?: 'name' | 'pin' | 'complete';
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
