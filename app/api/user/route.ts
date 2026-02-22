// backend/app/api/user/route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Try authenticated user first
    let user = await getUserFromRequest(request)

    if (!user) {
      // Accept guestId from query param (same as subscriptions/analytics routes)
      const { searchParams } = new URL(request.url)
      const guestId = searchParams.get('guestId')

      if (!guestId) {
        return createErrorResponse('Unauthorized', 401)
      }

      user = await getGuestUser(guestId)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const subscriptionCount = await (prisma.subscription as any).count({
      where: {
        userId: user.id,
        isActive: true,
      },
    })

    return createApiResponse({
      user: {
        id: user.id,
        email: user.email || null,
        isPro: user.isPro,
        proExpiresAt: user.proExpiresAt || null,
        subscriptionCount,
        subscriptionLimit: user.isPro ? null : 5,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    return createErrorResponse('Failed to fetch user', 500)
  }
}

const updateUserSchema = z.object({
  guestId: z.string().optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const data = updateUserSchema.parse(body)

    let user = await getUserFromRequest(request)

    if (!user && data.guestId) {
      user = await getGuestUser(data.guestId)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // No sensitive fields can be updated by clients
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {},
    })

    return createApiResponse({ user: updatedUser })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.errors[0].message, 400)
    }
    console.error('Update user error:', error)
    return createErrorResponse('Failed to update user', 500)
  }
}