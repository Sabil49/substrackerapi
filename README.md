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
  "transactionId": "string (purchase token or transaction ID)",
  "receipt": "string (receipt data from IAP SDK)",
  "platform": "android" | "ios" (defaults to "android")
}
```

**Response (Success - 200):**
```json
{
  "isPro": true,
  "planId": "yearly",
  "expiresAt": "2027-03-04T00:00:00Z"
}
```

**Response (Failure - 400/500):**
```json
{
  "message": "Payment verification failed. Please contact support."
}
```

### Environment Variables (Google Play)

To validate Android purchases, set these environment variables:

- `GOOGLE_PLAY_PACKAGE_NAME` – Your app's package name (e.g., `com.example.app`)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` – Service account email from Google Cloud
- `GOOGLE_PLAY_PRIVATE_KEY` – Private key from Google Cloud service account (with `\n` for newlines)

### Environment Variables (App Store)

To validate iOS purchases, set these (optional for now, requires full implementation):

- `APP_STORE_BUNDLE_ID` – Your app's bundle ID
- `APP_STORE_KEY_ID` – Key ID from App Store Connect
- `APP_STORE_ISSUER_ID` – Issuer ID from App Store Connect
- `APP_STORE_PRIVATE_KEY` – Private key from App Store Connect

### How It Works

1. Frontend obtains receipt/transaction token from React Native IAP
2. Frontend calls `/api/user/verify-premium-purchase` with the receipt
3. Backend validates receipt with Google Play or App Store
4. If valid, user's `isPro` status is set to `true` and `proExpiresAt` is updated
5. Response contains the new premium expiration date

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
