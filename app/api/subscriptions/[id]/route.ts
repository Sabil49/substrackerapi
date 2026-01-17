export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../../lib/auth'
import { calculateNextBillingDate, scheduleReminders } from '../../../../lib/notifications'

const updateSubscriptionSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  billingCycle: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']).optional(),
  customCycleDays: z.number().positive().optional(),
  startDate: z.string().datetime().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  iconUrl: z.string().optional(),
  color: z.string().optional(),
  isTrial: z.boolean().optional(),
  trialEndDate: z.string().datetime().optional().nullable(),
  notifyDaysBefore: z.array(z.number()).optional(),
  isActive: z.boolean().optional(),
  guestId: z.string().optional(),
}).refine(
  (data) => data.billingCycle !== 'CUSTOM' || data.customCycleDays !== undefined,
  { message: 'customCycleDays is required when billingCycle is CUSTOM', path: ['customCycleDays'] }
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const subscription = await (prisma.subscription as any).findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: {
        reminders: {
          where: {
            notificationSent: false,
          },
          orderBy: {
            scheduledFor: 'asc',
          },
        },
      },
    } as any)

    if (!subscription) {
      return createErrorResponse('Subscription not found', 404)
    }

    return createApiResponse({ subscription })
  } catch (error) {
    console.error('Get subscription error:', error)
    return createErrorResponse('Failed to fetch subscription', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const data = updateSubscriptionSchema.parse(body)

    let user
    if (data.guestId) {
      user = await getGuestUser(data.guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const existingSubscription = await (prisma.subscription as any).findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    } as any)

    if (!existingSubscription) {
      return createErrorResponse('Subscription not found', 404)
    }

    const updateData: any = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.amount !== undefined) updateData.amount = new Decimal(data.amount)
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.category !== undefined) updateData.category = data.category
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.iconUrl !== undefined) updateData.iconUrl = data.iconUrl
    if (data.color !== undefined) updateData.color = data.color
    if (data.isTrial !== undefined) updateData.isTrial = data.isTrial
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    if (data.trialEndDate !== undefined) {
      updateData.trialEndDate = data.trialEndDate ? new Date(data.trialEndDate) : null
    }

    if (data.billingCycle !== undefined) {
      updateData.billingCycle = data.billingCycle
      if (data.billingCycle === 'CUSTOM') {
        updateData.customCycleDays = data.customCycleDays
      } else {
        updateData.customCycleDays = null // Clear for non-custom cycles
      }

      const startDate = data.startDate 
        ? new Date(data.startDate) 
        : existingSubscription.startDate

      updateData.startDate = startDate
      updateData.nextBillingDate = calculateNextBillingDate(
        startDate,
        data.billingCycle as 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM',
        data.customCycleDays
      )
    } else if (data.startDate !== undefined) {
      updateData.startDate = new Date(data.startDate)
      updateData.nextBillingDate = calculateNextBillingDate(
        new Date(data.startDate),
        existingSubscription.billingCycle,
        existingSubscription.customCycleDays || undefined
      )
    }

    if (data.notifyDaysBefore !== undefined) {
      updateData.notifyDaysBefore = data.notifyDaysBefore
    }

    const subscription = await prisma.subscription.update({
      where: { id: params.id },
      data: updateData,
    })

    if (data.notifyDaysBefore !== undefined || data.startDate !== undefined || data.billingCycle !== undefined) {
      await scheduleReminders(subscription.id)
    }

    return createApiResponse({ subscription })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.errors[0].message, 400)
    }
    console.error('Update subscription error:', error)
    return createErrorResponse('Failed to update subscription', 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const subscription = await (prisma.subscription as any).findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    } as any)

    if (!subscription) {
      return createErrorResponse('Subscription not found', 404)
    }

    await prisma.subscription.delete({
      where: { id: params.id },
    })

    return createApiResponse({ message: 'Subscription deleted' })
  } catch (error) {
    console.error('Delete subscription error:', error)
    return createErrorResponse('Failed to delete subscription', 500)
  }
}