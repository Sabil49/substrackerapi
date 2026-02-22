//backend\app\api\subscriptions\route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'
import { calculateNextBillingDate, scheduleReminders } from '../../../lib/notifications'

const createSubscriptionSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  billingCycle: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']),
  customCycleDays: z.number().positive().optional(),
  startDate: z.string().datetime(),
  category: z.string().optional(),
  notes: z.string().optional(),
  iconUrl: z.string().optional(),
  color: z.string().optional(),
  isTrial: z.boolean().default(false),
  trialEndDate: z.string().datetime().optional(),
  notifyDaysBefore: z.array(z.number()).default([7, 3, 1, 0]),
  guestId: z.string().optional(),
}).refine(
  (data) => data.billingCycle !== 'CUSTOM' || data.customCycleDays !== undefined,
  { message: 'customCycleDays is required when billingCycle is CUSTOM', path: ['customCycleDays'] }
)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const guestId = searchParams.get('guestId')
    
    let user
    if (guestId) {
      user = await getGuestUser(guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const subscriptions = await (prisma.subscription as any).findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: {
        nextBillingDate: 'asc',
      },
    })

    return createApiResponse({ subscriptions })
  } catch (error) {
    console.error('Get subscriptions error:', error)
    return createErrorResponse('Failed to fetch subscriptions', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Received subscription data:', JSON.stringify(body, null, 2))
    
    const data = createSubscriptionSchema.parse(body)

    let user
    if (data.guestId) {
      user = await getGuestUser(data.guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    if (!user.isPro) {
      const subscriptionCount = await (prisma.subscription as any).count({
        where: {
          userId: user.id,
          isActive: true,
        },
      })

      if (subscriptionCount >= 5) {
        return createErrorResponse('Free tier limited to 5 subscriptions', 403)
      }
    }

    const startDate = new Date(data.startDate)
    const nextBillingDate = calculateNextBillingDate(
      startDate,
      data.billingCycle,
      data.customCycleDays
    )

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        name: data.name,
        amount: new Decimal(data.amount),
        currency: data.currency,
        billingCycle: data.billingCycle as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM',
        customCycleDays: data.customCycleDays,
        startDate,
        nextBillingDate,
        category: data.category,
        notes: data.notes,
        iconUrl: data.iconUrl,
        color: data.color,
        isTrial: data.isTrial,
        trialEndDate: data.trialEndDate ? new Date(data.trialEndDate) : null,
        notifyDaysBefore: data.notifyDaysBefore,
      },
    })

    try {
      await scheduleReminders(subscription.id)
    } catch (reminderError) {
      console.error('Failed to schedule reminders for subscription:', subscription.id, reminderError)
      // Subscription is still valid; reminders can be retried later
    }
    return createApiResponse({ subscription }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors)
      return createErrorResponse(`Validation error: ${error.errors[0].message}`, 400)
    }
    console.error('Create subscription error:', error)
    return createErrorResponse('Failed to create subscription', 500)
  }
}