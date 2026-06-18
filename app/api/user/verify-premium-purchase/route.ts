// backend/app/api/user/verify-premium-purchase/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '../../../../lib/db'
import {
  getUserFromRequest,
  getGuestUser,
  createApiResponse,
  createErrorResponse,
} from '../../../../lib/auth'
import { validateGooglePlayReceipt, validateAppStoreReceipt } from '../../../../lib/iap'

const verifyPremiumSchema = z.object({
  planId: z.enum(['monthly', 'yearly']),
  purchaseToken: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
  platform: z.enum(['android', 'ios']).optional().default('android'),
  receipt: z.string().optional(),
  guestId: z.string().optional(),
}).refine(
  (data) => data.purchaseToken || data.transactionId,
  { message: 'purchaseToken or transactionId is required', path: ['purchaseToken'] },
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planId, purchaseToken, transactionId, platform, receipt, guestId } = verifyPremiumSchema.parse(body)
    const effectivePurchaseToken = purchaseToken || transactionId

    let user = await getUserFromRequest(request)
    if (!user) {
      if (!guestId) {
        return createErrorResponse('Unauthorized', 401)
      }
      user = await getGuestUser(guestId)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    let validateResult
    if (platform === 'android') {
      if (!effectivePurchaseToken) {
        return createErrorResponse('Missing purchase token', 400)
      }
      validateResult = await validateGooglePlayReceipt(effectivePurchaseToken, planId)
    } else {
      if (!receipt) {
        return createErrorResponse('Missing iOS receipt', 400)
      }
      validateResult = await validateAppStoreReceipt(receipt)
    }

    if (!validateResult.isValid) {
      console.error('Verify premium failed', {
        userId: user.id,
        platform,
        planId,
        error: validateResult.error,
      })
      return createApiResponse({
        isPro: false,
        error: validateResult.error || 'Receipt validation failed',
      }, 400)
    }

    const data = validateResult.data || {}
    const expiryTime = data.expiryTime ? new Date(data.expiryTime) : null

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isPro: true,
        proPlanId: planId,
        proProductId: data.productId || (planId === 'monthly' ? 'com.substracker.premium.monthly' : 'com.substracker.premium.yearly'),
        proPurchaseToken: purchaseToken,
        proPaymentState: data.paymentState,
        proAutoRenewing: data.autoRenewing,
        proExpiresAt: expiryTime,
        proUpdatedAt: new Date(),
      },
    })

    return createApiResponse({
      isPro: updatedUser.isPro,
      proExpiresAt: updatedUser.proExpiresAt,
      planId,
      productId: data.productId,
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(`Validation error: ${err.errors[0].message}`, 400)
    }

    console.error('Verify premium purchase error:', err)
    return createErrorResponse('Payment verification failed. Please contact support.', 500)
  }
}

