// backend/lib/iap.ts
// In-App Purchase (IAP) receipt validation helpers

import { google } from 'googleapis'

// Initialize Google Play API
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

/**
 * Validate Google Play subscription receipt
 */
export async function validateGooglePlayReceipt(
  purchaseToken: string,
  planId?: 'monthly' | 'yearly',
  subscriptionId?: string,
): Promise<{ isValid: boolean; data?: any; error?: string }> {
  try {
    if (!purchaseToken) {
      return {
        isValid: false,
        error: 'Missing purchaseToken',
      }
    }

    const productId =
      subscriptionId ||
      (planId === 'monthly'
        ? 'com.substracker.premium.monthly'
        : planId === 'yearly'
        ? 'com.substracker.premium.yearly'
        : undefined)

    if (!productId) {
      return {
        isValid: false,
        error: 'Missing planId or subscription product ID',
      }
    }

    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME

    if (!packageName) {
      throw new Error('GOOGLE_PLAY_PACKAGE_NAME not configured')
    }

    const response = await (androidPublisher.purchases.subscriptions as any).get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    })

    const subscription = response.data

    if (!subscription) {
      return {
        isValid: false,
        error: 'Subscription not found',
      }
    }

    // optional cancellation and hold checks
    if (subscription.cancelationReason) {
      return {
        isValid: false,
        error: 'Subscription was cancelled',
      }
    }

    if (subscription.paymentState !== 1) {
      return {
        isValid: false,
        error: 'Payment not received',
      }
    }

    const expiryTime = parseInt(subscription.expiryTimeMillis || '0', 10)
    if (!expiryTime || expiryTime <= Date.now()) {
      return {
        isValid: false,
        error: 'Subscription has expired',
      }
    }

    return {
      isValid: true,
      data: {
        purchaseToken,
        productId,
        expiryTime,
        paymentState: subscription.paymentState,
        autoRenewing: subscription.autoRenewing,
        cancelationReason: subscription.cancelationReason,
        userCancellationTimeMillis: subscription.userCancellationTimeMillis,
      },
    }
  } catch (error: any) {
    console.error('Google Play validation error:', error)
    return {
      isValid: false,
      error: error?.message || 'Google Play validation failed',
    }
  }
}

/**
 * Validate App Store receipt (iOS) - Stub for future implementation
 */
export async function validateAppStoreReceipt(
  receipt: string,
): Promise<{ isValid: boolean; data?: any; error?: string }> {
  try {
    if (!receipt) {
      return { isValid: false, error: 'Missing receipt' }
    }

    const prodEndpoint = 'https://buy.itunes.apple.com/verifyReceipt'
    const sandboxEndpoint = 'https://sandbox.itunes.apple.com/verifyReceipt'

    const payload = {
      'receipt-data': receipt,
      'exclude-old-transactions': true,
      ...(process.env.APPLE_SHARED_SECRET
        ? { password: process.env.APPLE_SHARED_SECRET }
        : {}),
}

    const callApple = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    }

    // First try production endpoint
    let data: any = await callApple(prodEndpoint)

    // If Apple tells us this is a sandbox receipt, retry sandbox
    if (data && data.status === 21007) {
      data = await callApple(sandboxEndpoint)
    }

    if (!data || typeof data.status === 'undefined') {
      return { isValid: false, error: 'Invalid response from Apple' }
    }

    if (data.status !== 0) {
      return { isValid: false, error: `Apple verify status ${data.status}` }
    }

    // Prefer latest_receipt_info for subscriptions
    const receipts = data.latest_receipt_info || data.receipt?.in_app || []
    const latest = Array.isArray(receipts) && receipts.length
      ? [...receipts].sort(
          (a, b) =>
            Number(b.expires_date_ms || b.expiration_date_ms || 0) -
            Number(a.expires_date_ms || a.expiration_date_ms || 0),
        )[0]
      : receipts

    if (!latest) {
      return { isValid: false, error: 'No receipt info available' }
    }

    if (!['com.substracker.premium.monthly', 'com.substracker.premium.yearly'].includes(latest.product_id)) {
      return { isValid: false, error: 'Receipt is not for a SubTracker Premium product' }
    }

    if (latest.cancellation_date_ms) {
      return { isValid: false, error: 'Subscription was refunded or revoked' }
    }

    const expiryMs = parseInt(latest.expires_date_ms || latest.expiration_date_ms || '0', 10)
    if (!expiryMs || expiryMs <= Date.now()) {
      return { isValid: false, error: 'Subscription has expired' }
    }

    return {
      isValid: true,
      data: {
        purchaseToken: latest.original_transaction_id || latest.transaction_id,
        productId: latest.product_id,
        expiryTime: expiryMs,
        isTrial: latest.is_trial_period === 'true' || latest.is_in_intro_offer_period === 'true',
        raw: data,
      },
    }
  } catch (error: any) {
    console.error('App Store validation error:', error)
    return { isValid: false, error: error?.message || 'Validation failed' }
  }
}
