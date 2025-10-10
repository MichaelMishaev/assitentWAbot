import express, { Request, Response } from 'express';
import { dashboardTokenService } from '../services/DashboardTokenService.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { TaskService } from '../services/TaskService.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Serve the dashboard HTML page
 */
router.get('/d/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Validate token
    const tokenData = await dashboardTokenService.validateToken(token);
    if (!tokenData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>קישור לא תקין</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-red-50 to-red-100 min-h-screen flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <div class="text-6xl mb-4">🔒</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">הקישור לא תקין</h1>
            <p class="text-gray-600 mb-6">הקישור אינו תקף או שפג תוקפו (15 דקות)</p>
            <p class="text-sm text-gray-500">שלח הודעה לבוט כדי לקבל קישור חדש</p>
          </div>
        </body>
        </html>
      `);
    }

    // Read the dashboard template
    const templatePath = path.join(__dirname, '../templates/dashboard.html');
    let html = await fs.readFile(templatePath, 'utf-8');

    // Inject token into the HTML
    html = html.replace('{{TOKEN}}', token);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Failed to serve dashboard', { error });
    res.status(500).send(`
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>שגיאה</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">⚠️</div>
          <h1 class="text-2xl font-bold text-gray-800 mb-2">אופס! משהו השתבש</h1>
          <p class="text-gray-600">אנא נסה שוב מאוחר יותר</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * API endpoint to fetch dashboard data
 */
router.get('/api/dashboard/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Validate token
    const tokenData = await dashboardTokenService.validateToken(token);
    if (!tokenData) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const userId = tokenData.userId;

    // Fetch all data in parallel
    const eventService = new EventService();
    const reminderService = new ReminderService();
    const taskService = new TaskService();

    const [events, allReminders, allTasks] = await Promise.all([
      eventService.getUpcomingEvents(userId, 50), // Get next 50 events
      reminderService.getRemindersForToday(userId),
      taskService.getAllTasks(userId, true), // Include completed for stats
    ]);

    // Filter active and completed tasks
    const activeTasks = allTasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress');
    const completedTasks = allTasks.filter((t: any) => t.status === 'completed');

    // Calculate statistics
    const now = DateTime.now();
    const todayEvents = events.filter((e: any) => {
      const eventDate = DateTime.fromJSDate(e.startTsUtc);
      return eventDate.hasSame(now, 'day');
    });

    const upcomingReminders = allReminders.filter((r: any) => {
      const reminderDate = DateTime.fromJSDate(r.dueTsUtc);
      return reminderDate > now;
    });

    const stats = {
      totalEvents: events.length,
      todayEvents: todayEvents.length,
      totalReminders: allReminders.length,
      upcomingReminders: upcomingReminders.length,
      activeTasks: activeTasks.length,
      completedTasks: completedTasks.length,
    };

    // Get TTL for the token
    const ttl = await dashboardTokenService.getTokenTTL(token);

    res.json({
      success: true,
      expiresIn: ttl,
      data: {
        events: events.map((e: any) => ({
          id: e.id,
          title: e.title,
          startTsUtc: e.startTsUtc,
          endTsUtc: e.endTsUtc,
          location: e.location,
          notes: e.notes,
          isAllDay: e.isAllDay,
        })),
        reminders: allReminders.map((r: any) => ({
          id: r.id,
          title: r.title,
          dueTsUtc: r.dueTsUtc,
          recurrence: r.rrule,
          status: r.status,
        })),
        tasks: activeTasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueTsUtc: t.dueTsUtc,
          createdAt: t.createdAt,
        })),
        stats,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard data', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
