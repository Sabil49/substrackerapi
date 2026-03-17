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
        ? 'com.substracker.monthly'
        : planId === 'yearly'
        ? 'com.substracker.yearly'
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
    // TODO: Implement App Store Server API validation
    // For now, return false to require Android-only testing
    return {
      isValid: false,
      error: 'iOS validation not yet implemented',
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: error.message || 'Validation failed',
    }
  }
}
