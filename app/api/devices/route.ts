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
      // Check if device token is already registered to a different user
      const existingDevice = await (prisma.device.findFirst as any)({
        where: { deviceToken: data.deviceToken },
      })

      if (existingDevice && existingDevice.userId !== user.id) {
        // Device token is already owned by a different user
        return createErrorResponse('Device token already registered to another user', 403)
      }

      // Use atomic upsert with global unique deviceToken (ownership verified above)
      const device = await prisma.device.upsert({
        where: { deviceToken: data.deviceToken },
        create: {
          userId: user.id,
          deviceToken: data.deviceToken,
          platform: data.platform,
        },
        update: {
          platform: data.platform,
          isActive: true,
          lastActiveAt: new Date(),
        },
      })

      return createApiResponse({ device }, 201)
    } catch (error: any) {
      // Check if error is a unique constraint violation on deviceToken from another user
      // (in case of race condition between check and upsert)
      if (error.code === 'P2002' && error.meta?.target?.includes('deviceToken')) {
        // Device token is already registered to another user
        return createErrorResponse('Device token already registered to another user', 403)
      }
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