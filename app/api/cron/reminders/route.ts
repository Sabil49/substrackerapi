// backend\app\api\cron\reminders\route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { prisma } from '../../../../lib/db'
import { sendSubscriptionReminder, calculateNextBillingDate, scheduleReminders } from '../../../../lib/notifications'
import { createApiResponse, createErrorResponse } from '../../../../lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return createErrorResponse('Unauthorized', 401)
    }

    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    const reminders = await (prisma.reminder as any).findMany({
      where: {
        notificationSent: false,
        scheduledFor: {
          lte: fiveMinutesFromNow,
        },
      },
      include: {
        subscription: true,
      },
      orderBy: {
        scheduledFor: 'asc',
      },
      take: 100, // Process in batches to prevent memory issues
    } as any)
    let sentCount = 0
    let errorCount = 0

    for (const reminder of reminders) {
      try {
        // Atomically mark as sent before sending to prevent duplicates if send succeeds but update fails
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            notificationSent: true,
            sentAt: new Date(),
          },
        })

        // Only send after atomically marking as sent
        await sendSubscriptionReminder(reminder.subscriptionId, reminder.daysBefore)

        sentCount++
      } catch (error) {
        console.error(`Failed to send reminder ${reminder.id}:`, error)
        errorCount++
      }
    }

    const pastDueSubscriptions = await (prisma.subscription as any).findMany({
      where: {
        isActive: true,
        nextBillingDate: {
          lt: now,
        },
      },
      orderBy: { nextBillingDate: 'asc' },
      take: 100,
    })

    let updatedCount = 0

    for (const subscription of pastDueSubscriptions) {
      try {
        const nextBillingDate = calculateNextBillingDate(
          subscription.startDate,
          subscription.billingCycle,
          subscription.customCycleDays || undefined
        )

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { nextBillingDate },
        })

        await scheduleReminders(subscription.id)
        updatedCount++
      } catch (error) {
        console.error(`Failed to update subscription ${subscription.id}:`, error)
      }
    }

    return createApiResponse({
      message: 'Cron job completed',
      remindersSent: sentCount,
      remindersErrors: errorCount,
      subscriptionsUpdated: updatedCount,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return createErrorResponse('Cron job failed', 500)
  }
}