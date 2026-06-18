export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  createApiResponse,
  createErrorResponse,
  getGuestUser,
  getUserFromRequest,
} from '../../../../lib/auth'
import {
  validateAppStoreTransaction,
  validateGooglePlayReceipt,
} from '../../../../lib/iap'
import {
  grantPremiumEntitlement,
  PurchaseOwnershipError,
} from '../../../../lib/premium-entitlements'

const verifyPremiumSchema = z
  .object({
    platform: z.enum(['android', 'ios']),
    planId: z.enum(['monthly', 'yearly']).optional(),
    purchaseToken: z.string().min(1).optional(),
    signedTransaction: z.string().min(1).optional(),
    guestId: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (data.platform === 'android' && !data.purchaseToken) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Google Play purchase token is required',
        path: ['purchaseToken'],
      })
    }
    if (data.platform === 'ios' && !data.signedTransaction) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'App Store signed transaction is required',
        path: ['signedTransaction'],
      })
    }
  })

export async function POST(request: NextRequest) {
  try {
    const data = verifyPremiumSchema.parse(await request.json())
    let user = await getUserFromRequest(request)
    if (!user && data.guestId) user = await getGuestUser(data.guestId)
    if (!user) return createErrorResponse('Unauthorized', 401)

    const validation =
      data.platform === 'android'
        ? await validateGooglePlayReceipt(data.purchaseToken!)
        : await validateAppStoreTransaction(data.signedTransaction!)

    if (!validation.isValid) {
      return createErrorResponse(validation.error, 400)
    }

    const updatedUser = await grantPremiumEntitlement(user, validation.data)
    return createApiResponse({
      isPro: true,
      proExpiresAt: updatedUser.proExpiresAt,
      planId: validation.data.planId,
      productId: validation.data.productId,
      environment: validation.data.environment,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.errors[0].message, 400)
    }
    if (error instanceof PurchaseOwnershipError) {
      return createErrorResponse(error.message, 409)
    }
    console.error('Verify premium purchase error:', error)
    return createErrorResponse(
      'Payment verification is temporarily unavailable. Please try again.',
      500,
    )
  }
}
