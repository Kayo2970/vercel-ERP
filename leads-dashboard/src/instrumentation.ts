// Runs once when this Next.js server instance starts up — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md.
// Used here to start the in-process daily birthday-email scheduler
// (src/lib/birthday-scheduler.ts) and the weekly Indian-holiday sync +
// social-media approval-task scheduler (src/lib/holiday-scheduler.ts) rather
// than requiring an external VPS crontab entry, since this app runs
// continuously under PM2.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBirthdayScheduler } = await import('./lib/birthday-scheduler');
    startBirthdayScheduler();

    const { startHolidayScheduler } = await import('./lib/holiday-scheduler');
    startHolidayScheduler();
  }
}
