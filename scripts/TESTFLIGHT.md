TestFlight & Smoke Test Guide

This file contains quick commands to verify core features when testing via TestFlight.

Prerequisites
- Backend deployed and reachable at `API_URL` (set `EXPO_PUBLIC_API_URL` in the app or use env resolution)
- App installed from TestFlight on a real iOS device
- Sandbox tester Apple ID configured on the device
- APNs key uploaded to Firebase and backend configured with Firebase Admin
- Create iOS subscription products in App Store Connect with product IDs matching client strings
- Set `APPLE_BUNDLE_ID=com.sabil.subscriptiontracker` and the numeric
  `APPLE_APP_ID` on the deployed backend
- Apply backend migrations with `npx prisma migrate deploy`
- (Optional) Set `DEV_TEST_KEY` env var on backend for protected dev test endpoints

1) Register device token (from app)
- The app registers the Expo/FCM device token using `POST /api/devices` (automatic during startup in the client). To manually register a device token for test use:

curl -X POST "$API_URL/api/devices" \
  -H "Content-Type: application/json" \
  -d '{"deviceToken":"<DEVICE_TOKEN>", "platform":"ios", "guestId":"<GUEST_ID_IF_ANY>"}'

2) Send a server-side test push
- Use the protected dev route added at `/api/dev/dev-send-test-push` (requires `DEV_TEST_KEY` header matching backend env var)

curl -X POST "$API_URL/api/dev/send-test-push" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $DEV_TEST_KEY" \
  -d '{"deviceToken":"<DEVICE_TOKEN>","title":"Test Push","body":"This is a test push from backend"}'

3) Verify iOS purchase verification (server-side)
- After making a sandbox purchase on TestFlight, capture the signed StoreKit 2
  transaction JWS (`purchase.purchaseToken`). The app sends it automatically.
  You can also POST a saved JWS to the server:

curl -X POST "$API_URL/api/user/verify-premium-purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_JWT>" \
  -d '{"planId":"yearly","signedTransaction":"<STOREKIT_2_JWS>","platform":"ios"}'

4) Quick checks
- Auth: sign up, login, logout, and confirm `user.isPro` after purchase
- Subscriptions CRUD: create/edit/delete and confirm server sync
- Local notifications: create subscription with notifyDaysBefore and ensure local scheduling runs

Notes
- The dev send-test-push route is intentionally protected by `DEV_TEST_KEY`. Set `DEV_TEST_KEY` on your deployed backend and on your local environment to use it.
- The server attempts Apple Production verification first and Sandbox
  verification second. TestFlight transactions verify in Sandbox.
- Push testing requires a valid APNs config in Firebase + EAS build with Push capability.

If you want, I can add automated Node scripts that call these cURL commands and validate responses; tell me if you prefer scripts or direct cURL commands.
