// backend/lib/iap.ts
// In-App Purchase (IAP) receipt validation helpers

import { google } from 'googleapis'
import { JWT as JWTClient } from 'google-auth-library'

// Google Play validation
const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME
const GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL
const GOOGLE_PLAY_PRIVATE_KEY = process.env.GOOGLE_PLAY_PRIVATE_KEY

let androidPublisher: any = null

function getAndroidPublisher() {
  if (!androidPublisher) {
    if (
      !GOOGLE_PLAY_PACKAGE_NAME ||
      !GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL ||
      !GOOGLE_PLAY_PRIVATE_KEY
    ) {
      throw new Error('Google Play credentials not configured')
    }

    const auth = new JWTClient({
      email: GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PLAY_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })

    androidPublisher = google.androidpublisher({
      version: 'v3',
      auth: auth as any,
    })
  }

  return androidPublisher
}

export async function validateGooglePlayReceipt(
  productId: string,
  purchaseToken: string,
): Promise<{ isValid: boolean; data?: any }> {
  try {
    const androidpub = getAndroidPublisher()

    // For subscription validation
    const result = await (androidpub.purchases.subscriptions as any).get({
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    })

    const purchase = result.data

    // Check purchase state (0 = purchased, 1 = canceled)
    if (purchase.purchaseState !== 0) {
      return { isValid: false, data: { error: 'Purchase not in purchased state' } }
    }

    // Check if auto renewing (optional check)
    // const isAutoRenewing = purchase.autoRenewing === true

    return { isValid: true, data: purchase }
  } catch (error: any) {
    console.error('Google Play validation error:', error)
    return {
      isValid: false,
      data: { error: error.message || 'Google Play validation failed' },
    }
  }
}

// App Store Server API validation
const APP_STORE_BUNDLE_ID = process.env.APP_STORE_BUNDLE_ID
const APP_STORE_KEY_ID = process.env.APP_STORE_KEY_ID
const APP_STORE_ISSUER_ID = process.env.APP_STORE_ISSUER_ID
const APP_STORE_PRIVATE_KEY = process.env.APP_STORE_PRIVATE_KEY

export async function validateAppStoreReceipt(
  receipt: string,
): Promise<{ isValid: boolean; data?: any }> {
  try {
    // This is a placeholder for App Store validation
    // In production, you would:
    // 1. Decode the JWT receipt
    // 2. Verify with Apple's server
    // Or use a library like node-appstore-receipt-verification

    if (!receipt || receipt.length === 0) {
      return {
        isValid: false,
        data: { error: 'Invalid receipt format' },
      }
    }

    // For now, we'll do basic validation
    // In production, implement full App Store Server API validation
    console.warn(
      'App Store validation is a stub. Implement full validation in production.',
    )

    return { isValid: true, data: { message: 'Stub validation - implement production logic' } }
  } catch (error: any) {
    console.error('App Store validation error:', error)
    return {
      isValid: false,
      data: { error: error.message || 'App Store validation failed' },
    }
  }
}
