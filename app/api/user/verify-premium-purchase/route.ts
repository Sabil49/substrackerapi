// backend/app/api/user/verify-premium-purchase/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '../../../../lib/db'
import {
  getUserFromRequest,
  createApiResponse,
  createErrorResponse,
} from '../../../../lib/auth'
import { validateGooglePlayReceipt, validateAppStoreReceipt } from '../../../../lib/iap'

const verifyPremiumSchema = z.object({
  planId: z.enum(['monthly', 'yearly']),
  transactionId: z.string().min(1),
  receipt: z.string().min(1),
  platform: z.enum(['android', 'ios']).optional().default('android'),
})

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getUserFromRequest(request)
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { planId, transactionId, receipt, platform } = verifyPremiumSchema.parse(body)

    // Validate receipt based on platform
    let isValid = false
    let purchaseData: any = null

    if (platform === 'android') {
      const result = await validateGooglePlayReceipt(
        transactionId,
        receipt,
        planId,
      )
      isValid = result.isValid
      purchaseData = result.data
    } else if (platform === 'ios') {
      const result = await validateAppStoreReceipt(receipt)
      isValid = result.isValid
      purchaseData = result.data
    }

    if (!isValid) {
      console.error('Receipt validation failed', {
        platform,
        transactionId,
        error: purchaseData?.error,
      })
      return createErrorResponse(
        'Payment verification failed. Please contact support.',
        400,
      )
    }

    // Calculate expiration date based on Google Play or plan
    let expiresAt: Date
    if (purchaseData && purchaseData.expiryTime) {
      // Use the actual expiry time from Google Play
      expiresAt = new Date(purchaseData.expiryTime)
    } else {
      // Fallback: calculate based on plan
      const now = new Date()
      expiresAt = new Date(now)
      if (planId === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1)
      } else if (planId === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)
      }
    }

    // Update user's premium status
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isPro: true,
        proExpiresAt: expiresAt,
      },
    })

    return createApiResponse(
      {
        isPro: updatedUser.isPro,
        planId,
        expiresAt: expiresAt.toISOString(),
      },
      200,
    )
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(`Validation error: ${err.errors[0].message}`, 400)
    }

    console.error('Verify premium purchase error:', err)
    return createErrorResponse(
      'Payment verification failed. Please contact support.',
      500,
    )
  }
}
