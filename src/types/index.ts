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
  DELETING_EVENT = 'DELETING_EVENT',
  ADDING_CONTACT = 'ADDING_CONTACT',
  SETTINGS_MENU = 'SETTINGS_MENU',
  DRAFT_MESSAGE = 'DRAFT_MESSAGE',
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
