import { prisma } from './db'
import type { VerifiedPremiumPurchase } from './iap'

export class PurchaseOwnershipError extends Error {}

export async function grantPremiumEntitlement(
  user: any,
  purchase: VerifiedPremiumPurchase,
) {
  const existingPurchase = await (prisma.premiumPurchase as any).findUnique({
    where: {
      store_externalId: {
        store: purchase.store,
        externalId: purchase.externalId,
      },
    },
    include: { user: true },
  })

  if (
    existingPurchase &&
    existingPurchase.userId !== user.id &&
    !existingPurchase.user?.isGuest
  ) {
    throw new PurchaseOwnershipError(
      'This store subscription is already linked to another SubTracker account. Sign in to that account to restore it.',
    )
  }

  const expiry = new Date(purchase.expiryTime)
  const results = await (prisma as any).$transaction([
    (prisma.premiumPurchase as any).upsert({
      where: {
        store_externalId: {
          store: purchase.store,
          externalId: purchase.externalId,
        },
      },
      create: {
        userId: user.id,
        store: purchase.store,
        environment: purchase.environment,
        externalId: purchase.externalId,
        transactionId: purchase.transactionId,
        productId: purchase.productId,
        planId: purchase.planId,
        purchaseToken: purchase.purchaseToken,
        expiresAt: expiry,
        autoRenewing: purchase.autoRenewing,
        paymentState: purchase.paymentState,
        lastVerifiedAt: new Date(),
      },
      update: {
        userId: user.id,
        environment: purchase.environment,
        transactionId: purchase.transactionId,
        productId: purchase.productId,
        planId: purchase.planId,
        purchaseToken: purchase.purchaseToken,
        expiresAt: expiry,
        autoRenewing: purchase.autoRenewing,
        paymentState: purchase.paymentState,
        lastVerifiedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        isPro: true,
        proPlanId: purchase.planId,
        proProductId: purchase.productId,
        proPurchaseToken: purchase.purchaseToken,
        proPaymentState: purchase.paymentState,
        proAutoRenewing: purchase.autoRenewing,
        proExpiresAt: expiry,
        proUpdatedAt: new Date(),
      },
    }),
  ])

  return results[1]
}
