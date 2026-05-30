//backend\app\api\devices\route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'

const registerDeviceSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  guestId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = registerDeviceSchema.parse(body)

    let user
    if (data.guestId) {
      user = await getGuestUser(data.guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    try {
      // Allow device token reassignment (guest → auth conversion or device reuse)
      // Delete any existing device tokens for this user first to avoid conflicts
      await prisma.device.deleteMany({
        where: { userId: user.id },
      })

      // Reassign device token to current user (upsert handles guest → auth conversion)
      const device = await prisma.device.upsert({
        where: { deviceToken: data.deviceToken },
        create: {
          userId: user.id,
          deviceToken: data.deviceToken,
          platform: data.platform,
        },
        update: {
          userId: user.id,
          platform: data.platform,
          isActive: true,
          lastActiveAt: new Date(),
        },
      })

      return createApiResponse({ device }, 201)
    } catch (error: any) {
      console.error('Device registration error:', error)
      throw error
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.errors[0].message, 400)
    }
    console.error('Register device error:', error)
    return createErrorResponse('Failed to register device', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceToken = searchParams.get('deviceToken')
    const guestId = searchParams.get('guestId')

    if (!deviceToken) {
      return createErrorResponse('Device token required', 400)
    }

    let user
    if (guestId) {
      user = await getGuestUser(guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    await prisma.device.updateMany({
      where: {
        deviceToken,
        userId: user.id,
      },
      data: {
        isActive: false,
      },
    })

    return createApiResponse({ message: 'Device unregistered' })
  } catch (error) {
    console.error('Unregister device error:', error)
    return createErrorResponse('Failed to unregister device', 500)
  }
}