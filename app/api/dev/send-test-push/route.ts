// backend/app/api/dev/send-test-push/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { sendPushNotification } from '../../../../lib/notifications'
import { createApiResponse, createErrorResponse } from '../../../../lib/auth'

const payloadSchema = z.object({
  deviceToken: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
})

/**
 * Dev-only route to send a test push notification to a device token.
 * Protect by setting DEV_TEST_KEY in the backend env and include header `x-admin-key`.
 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = process.env.DEV_TEST_KEY
    const provided = request.headers.get('x-admin-key')

    if (!adminKey || adminKey.length === 0) {
      return createErrorResponse('DEV_TEST_KEY not configured on server', 403)
    }

    if (provided !== adminKey) {
      return createErrorResponse('Forbidden', 403)
    }

    const body = await request.json()
    const data = payloadSchema.parse(body)

    const ok = await sendPushNotification(data.deviceToken, data.title, data.body, { test: 'true' })
    if (!ok) {
      return createErrorResponse('Failed to send push', 500)
    }

    return createApiResponse({ success: true })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Dev send-test-push error', err)
    return createErrorResponse('Failed to send test push', 500)
  }
}
