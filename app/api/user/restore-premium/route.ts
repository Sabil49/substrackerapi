// backend/app/api/user/restore-premium/route.ts
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

const restorePremiumSchema = z.object({
  platform: z.enum(['android', 'ios']).optional().default('android'),
  purchaseToken: z.string().optional(),
  planId: z.enum(['monthly', 'yearly']).optional(),
  receipt: z.string().optional(),
  guestId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { platform, purchaseToken, planId, receipt, guestId } = restorePremiumSchema.parse(body)

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

    if (platform === 'android') {
      const token = purchaseToken || user.proPurchaseToken
      const plan = planId || (user.proPlanId as 'monthly' | 'yearly' | undefined)

      if (!token || !plan) {
        return createErrorResponse('Missing purchase token or planId for restore.', 400)
      }

      const validateResult = await validateGooglePlayReceipt(token, plan)
      if (!validateResult.isValid) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isPro: false },
        })
        return createApiResponse({
          isPro: false,
          error: validateResult.error || 'Failed to restore premium',
        }, 400)
      }

      const data = validateResult.data || {}
      const expiryAt = data.expiryTime ? new Date(data.expiryTime) : null

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          isPro: true,
          proPlanId: plan,
          proProductId: data.productId,
          proPurchaseToken: token,
          proPaymentState: data.paymentState,
          proAutoRenewing: data.autoRenewing,
          proExpiresAt: expiryAt,
          proUpdatedAt: new Date(),
        },
      })

      return createApiResponse({
        isPro: updatedUser.isPro,
        proExpiresAt: updatedUser.proExpiresAt,
        planId: plan,
      })
    }

    if (platform === 'ios') {
      if (!receipt) {
        return createErrorResponse('Missing iOS receipt for restore.', 400)
      }
      const validateResult = await validateAppStoreReceipt(receipt)
      if (!validateResult.isValid) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isPro: false },
        })
        return createApiResponse({
          isPro: false,
          error: validateResult.error || 'Failed to restore premium',
        }, 400)
      }

      const data = validateResult.data || {}
      const restoredPlan =
        data.productId === 'com.substracker.premium.monthly' ? 'monthly' : 'yearly'
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          isPro: true,
          proPlanId: restoredPlan,
          proProductId: data.productId,
          proPurchaseToken: data.purchaseToken,
          proExpiresAt: data.expiryTime ? new Date(data.expiryTime) : null,
          proUpdatedAt: new Date(),
        },
      })

      return createApiResponse({
        isPro: updatedUser.isPro,
        proExpiresAt: updatedUser.proExpiresAt,
        planId: restoredPlan,
      })
    }

    return createErrorResponse('Invalid platform', 400)
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(`Validation error: ${err.errors[0].message}`, 400)
    }
    console.error('Restore premium error:', err)
    return createErrorResponse('Failed to restore premium', 500)
  }
}
