import { readFileSync } from 'fs'
import path from 'path'
import {
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library'
import { google } from 'googleapis'

export const PREMIUM_PRODUCTS = [
  'com.substracker.premium.monthly',
  'com.substracker.premium.yearly',
] as const

export type PremiumPlanId = 'monthly' | 'yearly'
export type StorePlatform = 'android' | 'ios'

export interface VerifiedPremiumPurchase {
  store: StorePlatform
  environment: string
  productId: string
  planId: PremiumPlanId
  externalId: string
  transactionId: string
  purchaseToken: string
  expiryTime: number
  autoRenewing?: boolean
  paymentState?: number
}

export type PurchaseValidationResult =
  | { isValid: true; data: VerifiedPremiumPurchase }
  | { isValid: false; error: string }

function planForProduct(productId: string): PremiumPlanId | null {
  if (productId === PREMIUM_PRODUCTS[0]) return 'monthly'
  if (productId === PREMIUM_PRODUCTS[1]) return 'yearly'
  return null
}

const androidPublisher = google.androidpublisher({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PLAY_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
      client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    } as any,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  }),
})

export async function validateGooglePlayReceipt(
  purchaseToken: string,
): Promise<PurchaseValidationResult> {
  try {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME
    if (!packageName) {
      throw new Error('GOOGLE_PLAY_PACKAGE_NAME is not configured')
    }
    if (!purchaseToken) {
      return { isValid: false, error: 'Missing Google Play purchase token' }
    }

    const response = await (androidPublisher.purchases.subscriptionsv2 as any).get({
      packageName,
      token: purchaseToken,
    })
    const subscription = response.data
    const allowedStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      // Cancellation stops renewal but entitlement remains until expiry.
      'SUBSCRIPTION_STATE_CANCELED',
    ])

    if (!subscription || !allowedStates.has(subscription.subscriptionState)) {
      return {
        isValid: false,
        error:
          subscription?.subscriptionState === 'SUBSCRIPTION_STATE_ON_HOLD'
            ? 'Subscription payment is on hold'
            : 'No active Google Play subscription was found',
      }
    }

    const lineItems = Array.isArray(subscription.lineItems)
      ? subscription.lineItems
      : []
    const validLineItems = lineItems
      .map((item: any) => ({
        item,
        expiryTime: Date.parse(item.expiryTime || ''),
      }))
      .filter(
        ({ item, expiryTime }: any) =>
          planForProduct(item.productId) && Number.isFinite(expiryTime),
      )
      .sort((a: any, b: any) => b.expiryTime - a.expiryTime)
    const latest = validLineItems[0]

    if (!latest || latest.expiryTime <= Date.now()) {
      return { isValid: false, error: 'Google Play subscription has expired' }
    }

    const productId = latest.item.productId
    const planId = planForProduct(productId)
    if (!planId) {
      return { isValid: false, error: 'Unknown Google Play subscription product' }
    }

    return {
      isValid: true,
      data: {
        store: 'android',
        environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Test',
        productId,
        planId,
        externalId: purchaseToken,
        transactionId:
          subscription.latestOrderId || latest.item.latestSuccessfulOrderId || purchaseToken,
        purchaseToken,
        expiryTime: latest.expiryTime,
        paymentState: 1,
        autoRenewing: Boolean(latest.item.autoRenewingPlan?.autoRenewEnabled),
      },
    }
  } catch (error: any) {
    console.error('Google Play validation error:', error)
    return {
      isValid: false,
      error: 'Google Play could not verify this subscription. Please try again.',
    }
  }
}

let appleRootCertificates: Buffer[] | null = null

function loadAppleRootCertificates() {
  if (appleRootCertificates) return appleRootCertificates

  const envCertificates = [
    process.env.APPLE_ROOT_CA_G2_BASE64,
    process.env.APPLE_ROOT_CA_G3_BASE64,
  ].filter(Boolean) as string[]

  if (envCertificates.length === 2) {
    appleRootCertificates = envCertificates.map((certificate) =>
      Buffer.from(certificate, 'base64'),
    )
    return appleRootCertificates
  }

  appleRootCertificates = [
    readFileSync(path.join(process.cwd(), 'certs', 'AppleRootCA-G2.cer')),
    readFileSync(path.join(process.cwd(), 'certs', 'AppleRootCA-G3.cer')),
  ]
  return appleRootCertificates
}

async function verifyAppleJwsForEnvironment(
  signedTransaction: string,
  environment: Environment,
) {
  const bundleId =
    process.env.APPLE_BUNDLE_ID || 'com.sabil.subscriptiontracker'
  const appAppleId = process.env.APPLE_APP_ID
    ? Number(process.env.APPLE_APP_ID)
    : undefined

  if (environment === Environment.PRODUCTION && !appAppleId) {
    throw new Error('APPLE_APP_ID is required for production verification')
  }

  const verifier = new SignedDataVerifier(
    loadAppleRootCertificates(),
    true,
    environment,
    bundleId,
    appAppleId,
  )
  return verifier.verifyAndDecodeTransaction(signedTransaction)
}

export async function validateAppStoreTransaction(
  signedTransaction: string,
): Promise<PurchaseValidationResult> {
  try {
    if (!signedTransaction || signedTransaction.split('.').length !== 3) {
      return { isValid: false, error: 'Missing or invalid App Store transaction' }
    }

    let transaction: Awaited<
      ReturnType<typeof verifyAppleJwsForEnvironment>
    > | null = null
    let productionError: unknown

    try {
      transaction = await verifyAppleJwsForEnvironment(
        signedTransaction,
        Environment.PRODUCTION,
      )
    } catch (error) {
      productionError = error
    }

    if (!transaction) {
      try {
        transaction = await verifyAppleJwsForEnvironment(
          signedTransaction,
          Environment.SANDBOX,
        )
      } catch (sandboxError) {
        console.error('Apple transaction verification failed', {
          productionError,
          sandboxError,
        })
        return {
          isValid: false,
          error: 'Apple could not verify this subscription.',
        }
      }
    }

    const productId = transaction.productId || ''
    const planId = planForProduct(productId)
    if (!planId) {
      return { isValid: false, error: 'Unknown App Store subscription product' }
    }
    if (!transaction.originalTransactionId || !transaction.transactionId) {
      return { isValid: false, error: 'Incomplete App Store transaction' }
    }
    if (transaction.revocationDate) {
      return { isValid: false, error: 'App Store subscription was revoked or refunded' }
    }
    if (!transaction.expiresDate || transaction.expiresDate <= Date.now()) {
      return { isValid: false, error: 'App Store subscription has expired' }
    }

    return {
      isValid: true,
      data: {
        store: 'ios',
        environment: String(transaction.environment || 'Unknown'),
        productId,
        planId,
        externalId: transaction.originalTransactionId,
        transactionId: transaction.transactionId,
        purchaseToken: signedTransaction,
        expiryTime: transaction.expiresDate,
      },
    }
  } catch (error) {
    console.error('App Store validation error:', error)
    return {
      isValid: false,
      error: 'Apple could not verify this subscription. Please try again.',
    }
  }
}
