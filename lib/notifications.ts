//backend\lib\notifications.ts
import { messaging } from './firebase'
import { prisma } from './db'

export async function sendPushNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    const message = {
      token: deviceToken,
      notification: {
        title,
        body,
      },
      data: data || {},
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          priority: 'high' as const,
        },
      },
    }

    await messaging.send(message)
    return true
  } catch (error: any) {
    console.error('Push notification error:', error)
    
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await prisma.device.updateMany({
        where: { deviceToken },
        data: { isActive: false },
      })
    }
    
    return false
  }
}

export async function sendSubscriptionReminder(
  subscriptionId: string,
  daysBefore: number
) {
  const subscription = await (prisma.subscription as any).findUnique({
    where: { id: subscriptionId },
    include: {
      user: {
        include: {
          devices: {
            where: { isActive: true },
          },
        },
      },
    },
  })

  if (!subscription || !subscription.isActive) {
    return
  }

  if (!subscription.user) {
    console.error(`Subscription ${subscriptionId} has no associated user`)
    return
  }

  const devices = subscription.user.devices
  if (devices.length === 0) {
    return
  }
  let title: string
  let body: string

  if (daysBefore === 0) {
    title = `${subscription.name} charges today!`
    body = `${subscription.currency} ${subscription.amount} will be charged today`
  } else if (daysBefore === 1) {
    title = `${subscription.name} charges tomorrow`
    body = `${subscription.currency} ${subscription.amount} will be charged in 1 day`
  } else {
    title = `${subscription.name} upcoming charge`
    body = `${subscription.currency} ${subscription.amount} will be charged in ${daysBefore} days`
  }

  const data = {
    subscriptionId: subscription.id,
    type: 'reminder',
    daysBefore: daysBefore.toString(),
  }

  for (const device of devices) {
    await sendPushNotification(device.deviceToken, title, body, data)
  }
}

function addMonthsStable(date: Date, months: number): Date {
  const result = new Date(date)
  const originalDay = result.getDate()
  result.setMonth(result.getMonth() + months)
  
  // If the day overflowed (e.g., Jan 31 + 1 month = Mar 3), adjust to last day of target month
  if (result.getDate() !== originalDay) {
    result.setDate(0)
  }
  
  return result
}

export function calculateNextBillingDate(
  startDate: Date,
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM',
  customCycleDays?: number
): Date {
  const now = new Date()
  let nextDate = new Date(startDate)

  switch (billingCycle) {
    case 'WEEKLY':
      while (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 7)
      }
      break
    case 'MONTHLY':
      while (nextDate <= now) {
        nextDate = addMonthsStable(nextDate, 1)
      }
      break
    case 'YEARLY':
      while (nextDate <= now) {
        nextDate.setFullYear(nextDate.getFullYear() + 1)
      }
      break
    case 'CUSTOM':
      if (!customCycleDays || !Number.isInteger(customCycleDays) || customCycleDays <= 0) {
        throw new Error(`customCycleDays must be a positive integer, received: ${customCycleDays}`)
      }
      while (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + customCycleDays)
      }
      break
  }

  return nextDate
}

export async function scheduleReminders(subscriptionId: string) {
  const subscription = await (prisma.subscription as any).findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription || !subscription.isActive) {
    return
  }

  await prisma.reminder.deleteMany({
    where: {
      subscriptionId,
      notificationSent: false,
    },
  })

  let notifyDays: number[] = []
  
  try {
    // Parse notifyDaysBefore with validation
    let parsed: unknown
    
    if (Array.isArray(subscription.notifyDaysBefore)) {
      // Already an array (from Json type in Prisma)
      parsed = subscription.notifyDaysBefore
    } else if (typeof subscription.notifyDaysBefore === 'string') {
      // Legacy string format, parse JSON
      parsed = JSON.parse(subscription.notifyDaysBefore)
    } else {
      throw new Error(`Invalid notifyDaysBefore format: expected array or string, got ${typeof subscription.notifyDaysBefore}`)
    }
    
    // Validate parsed result is an array of numbers
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid notifyDaysBefore: expected array, got ${typeof parsed}`)
    }
    
    if (!parsed.every((item) => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error(`Invalid notifyDaysBefore: all items must be finite numbers`)
    }
    
    notifyDays = parsed as number[]
  } catch (error) {
    console.error(`Failed to parse notifyDaysBefore for subscription ${subscriptionId}:`, error)
    // Default to empty array on parse failure - no reminders will be scheduled
    notifyDays = []
  }
  
  const nextBilling = new Date(subscription.nextBillingDate)

  for (const days of notifyDays) {
    const scheduledDate = new Date(nextBilling)
    scheduledDate.setDate(scheduledDate.getDate() - days)

    if (scheduledDate > new Date()) {
      await prisma.reminder.create({
        data: {
          subscriptionId,
          scheduledFor: scheduledDate,
          daysBefore: days,
        },
      })
    }
  }
}