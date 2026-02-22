//backend\app\api\user\route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'

export async function GET(request: NextRequest) {
  try {
    // First, try to get authenticated user via token
    let user = await getUserFromRequest(request)
    
    // If no authenticated user, check for guest session via secure cookie
    if (!user) {
      const guestIdCookie = request.cookies.get('guestId')?.value
      
      // Reject requests without proper authentication
      if (!guestIdCookie) {
        return createErrorResponse('Unauthorized: Missing or invalid authentication', 401)
      }
      
      // Only use guestId from secure cookie, never from query params
      user = await getGuestUser(guestIdCookie)
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
        email: user.email,
        isPro: user.isPro,
        proExpiresAt: user.proExpiresAt,
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

// NOTE: isPro and proExpiresAt must only be updated via:
// - Admin-only endpoints with proper authorization
// - Payment webhook handlers (subscription/payment events)
// Clients cannot modify these privilege fields directly

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const data = updateUserSchema.parse(body)

    // Authenticate user via token or secure cookie
    let user = await getUserFromRequest(request)
    if (!user && data.guestId) {
      // Only allow guests to update if coming from a validated request
      const guestIdCookie = request.cookies.get('guestId')?.value
      if (guestIdCookie === data.guestId) {
        user = await getGuestUser(data.guestId)
      }
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Only allow updates to non-sensitive fields
    const updateData: any = {}
    // guestId is immutable, don't allow updates to it
    // Any privilege fields (isPro, proExpiresAt) must be updated via admin/webhook handlers only

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
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