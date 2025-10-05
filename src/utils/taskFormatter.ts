import { DateTime } from 'luxon';

/**
 * Formats a task list for display
 */
export function renderTaskList(tasks: any[], title: string): string {
  if (!tasks || tasks.length === 0) {
    return `✅ ${title}\n\nאין משימות להצגה.`;
  }

  let output = `✅ ${title}\n\n`;

  tasks.forEach((task, index) => {
    const priorityEmojis: Record<string, string> = {
      urgent: '🔴',
      high: '🟠',
      normal: '🟡',
      low: '🟢'
    };
    const priorityEmoji = priorityEmojis[task.priority as string] || '🟡';

    const statusEmojis: Record<string, string> = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌'
    };
    const statusEmoji = statusEmojis[task.status as string] || '⏳';

    let taskLine = `${index + 1}. ${statusEmoji} ${task.title}`;

    if (task.dueTsUtc) {
      const dueDate = DateTime.fromJSDate(
        task.dueTsUtc instanceof Date ? task.dueTsUtc : new Date(task.dueTsUtc)
      ).setZone('Asia/Jerusalem');
      const now = DateTime.now().setZone('Asia/Jerusalem');

      if (dueDate < now && task.status !== 'completed') {
        taskLine += ` ⚠️ באיחור`;
      } else {
        taskLine += ` 📅 ${dueDate.toFormat('dd/MM')}`;
      }
    }

    taskLine += ` ${priorityEmoji}`;

    if (task.description) {
      taskLine += `\n   💬 ${task.description.substring(0, 50)}${task.description.length > 50 ? '...' : ''}`;
    }

    output += taskLine + '\n\n';
  });

  return output.trim();
}

/**
 * Formats a single task for detailed display
 */
export function renderTaskDetails(task: any): string {
  const priorityEmojis: Record<string, string> = {
    urgent: '🔴 דחוף',
    high: '🟠 גבוה',
    normal: '🟡 רגיל',
    low: '🟢 נמוך'
  };
  const priorityEmoji = priorityEmojis[task.priority as string] || '🟡 רגיל';

  const statusTexts: Record<string, string> = {
    pending: '⏳ ממתין',
    in_progress: '🔄 בביצוע',
    completed: '✅ הושלם',
    cancelled: '❌ בוטל'
  };
  const statusText = statusTexts[task.status as string] || '⏳ ממתין';

  let output = `📌 ${task.title}\n\n`;
  output += `סטטוס: ${statusText}\n`;
  output += `עדיפות: ${priorityEmoji}\n`;

  if (task.description) {
    output += `\n📝 תיאור:\n${task.description}\n`;
  }

  if (task.dueTsUtc) {
    const dueDate = DateTime.fromJSDate(
      task.dueTsUtc instanceof Date ? task.dueTsUtc : new Date(task.dueTsUtc)
    ).setZone('Asia/Jerusalem');
    output += `\n📅 תאריך יעד: ${dueDate.toFormat('dd/MM/yyyy HH:mm')}\n`;

    const now = DateTime.now().setZone('Asia/Jerusalem');
    if (dueDate < now && task.status !== 'completed') {
      const daysDiff = Math.floor(now.diff(dueDate, 'days').days);
      output += `⚠️ באיחור ${daysDiff} ימים\n`;
    }
  }

  if (task.completedAt) {
    const completedDate = DateTime.fromJSDate(
      task.completedAt instanceof Date ? task.completedAt : new Date(task.completedAt)
    ).setZone('Asia/Jerusalem');
    output += `\n✅ הושלם ב: ${completedDate.toFormat('dd/MM/yyyy HH:mm')}\n`;
  }

  return output;
}
