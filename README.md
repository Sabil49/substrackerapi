This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Auth API

The backend exposes a simple authentication API under `/api/auth`.  It
uses a local PostgreSQL database managed by Prisma and issues JWT tokens.
Make sure the following environment variables are set:

- `DATABASE_URL` – your Postgres connection string (already required by
  Prisma).  
- `JWT_SECRET` – a strong secret used to sign tokens (defaults to
  `'change_me'` in development).

After editing the Prisma schema (auth now stores `passwordHash` and no
longer uses `firebaseUid`), run a migration before starting the server:

```bash
npx prisma migrate dev --name add_password_hash --preview-feature
```
No Firebase configuration or API key is required.

- `POST /api/auth/signup` – register a user in the Postgres database and
  return a JWT plus the user object
- `POST /api/auth/login` – verify credentials, issue JWT and return user
- `POST /api/auth/logout` – stateless endpoint; clients simply discard token

These endpoints are used by the frontend when a user wants to buy a
subscription.  If the caller is unauthenticated they can still operate
as a guest by creating a guest session through `/api/guest` and including
`guestId` as a query parameter on the normal APIs.

## In-App Purchase (IAP) Verification

The backend provides an endpoint to verify in-app purchases from React Native
apps (iOS and Android) and update the user's premium status.

### Endpoint

`POST /api/user/verify-premium-purchase`

**Headers:**
- `Authorization: Bearer {jwtToken}` – user's JWT token
- `Content-Type: application/json`

**Request Body:**
```json
{
  "planId": "monthly" | "yearly",
  "transactionId": "string (purchase token from Google Play)",
  "receipt": "string (product ID or receipt data)",
  "platform": "android" | "ios" (defaults to "android")
}
```

**Response (Success - 200):**
```json
{
  "isPro": true,
  "planId": "yearly",
  "expiresAt": "2027-03-05T10:30:45.000Z"
}
```

**Response (Failure - 400/500):**
```json
{
  "message": "Payment verification failed. Please contact support."
}
```

### Environment Variables (Google Play)

To validate Android purchases, set these environment variables in your `.env` file:

```bash
# Get these from Google Cloud Console / Firebase Project Service Account
GOOGLE_CLOUD_PROJECT_ID=substracker-647d9
GOOGLE_CLOUD_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_PLAY_PACKAGE_NAME=com.sabil.subscriptiontracker
GOOGLE_PLAY_PRIVATE_KEY_ID=key_id_from_json
GOOGLE_PLAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=firebase-adminsdk-fbsvc@substracker-647d9.iam.gserviceaccount.com
APPLE_BUNDLE_ID=com.sabil.subscriptiontracker
# Numeric Apple ID from App Store Connect > App Information.
# Required for production purchases; TestFlight uses the Sandbox verifier.
APPLE_APP_ID=1234567890
```

Apple StoreKit 2 purchases are verified as signed JWS transactions with
Apple's official `@apple/app-store-server-library`. The Apple G2/G3 root
certificates are stored under `backend/certs`. On environments where bundled
certificate files are unavailable, set `APPLE_ROOT_CA_G2_BASE64` and
`APPLE_ROOT_CA_G3_BASE64` to the base64-encoded DER certificate contents.

After deploying this version, apply the purchase-ledger migration:

```bash
npx prisma migrate deploy
```

Both the backend and mobile app must be deployed together. Older mobile builds
send a legacy `receipt` value and will receive Apple status `21002`; current
builds send the StoreKit 2 `signedTransaction`.

### How to Get Google Play Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select your project
3. Enable the `Android Publisher API`
4. Create a Service Account:
   - Go to **Service Accounts** → **Create Service Account**
   - Grant role: **Editor** or **Android Publisher Full Access**
5. Create a JSON key and copy the values from the provided JSON file

### Subscription Product IDs

The backend maps `planId` to specific product IDs:
- `planId: "monthly"` → `com.substracker.premium.monthly`
- `planId: "yearly"` → `com.substracker.premium.yearly`

Make sure these product IDs are created in Google Play Console and match your
frontend React Native IAP configuration.

### Validation Logic

The backend validates:
- ✅ Transaction ID is not empty
- ✅ Subscription exists in Google Play
- ✅ Not cancelled (`cancelationReason` is null)
- ✅ Payment is received (`paymentState === 1`)
- ✅ Not expired (`expiryTimeMillis` is in the future)

If any check fails, the endpoint returns a 400 error with an error message.

### Testing with Postman

1. **Authenticate first** to get a JWT token:
   ```
   POST http://localhost:3000/api/auth/login
   Content-Type: application/json
   
   {
     "email": "test@example.com",
     "password": "password123"
   }
   ```
   Copy the `token` from the response.

2. **Verify purchase**:
   ```
   POST http://localhost:3000/api/user/verify-premium-purchase
   Authorization: Bearer {your_token}
   Content-Type: application/json
   
   {
     "planId": "monthly",
     "transactionId": "gpa.1234567890.abcdefg",
     "receipt": "com.substracker.premium.monthly",
     "platform": "android"
   }
   ```

### Frontend Integration (React Native)

```typescript
import { Platform } from 'react-native'

const verifyPurchase = async (purchase: PurchaseResult, jwt: string) => {
  const response = await fetch('YOUR_API/api/user/verify-premium-purchase', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      planId: purchase.productId === 'com.substracker.premium.monthly' ? 'monthly' : 'yearly',
      transactionId: purchase.purchaseToken || purchase.transactionId,
      receipt: purchase.productId,
      platform: Platform.OS,
    }),
  })

  const result = await response.json()
  if (result.isPro) {
    console.log('Premium activated until:', result.expiresAt)
  } else {
    console.error('Verification failed:', result.message)
  }
}
```

### iOS Support

iOS purchase and restore flows use StoreKit 2 signed transactions. The backend:

1. Verifies the JWS certificate chain and signature.
2. Verifies bundle ID, environment, product ID, expiry, and revocation state.
3. Stores the Apple original transaction ID in `PremiumPurchase`.
4. Prevents the same store subscription from being linked to multiple
   non-guest SubTracker accounts.


## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
