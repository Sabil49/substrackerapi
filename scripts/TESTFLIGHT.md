TestFlight & Smoke Test Guide

This file contains quick commands to verify core features when testing via TestFlight.

Prerequisites
- Backend deployed and reachable at `API_URL` (set `EXPO_PUBLIC_API_URL` in the app or use env resolution)
- App installed from TestFlight on a real iOS device
- Sandbox tester Apple ID configured on the device
- APNs key uploaded to Firebase and backend configured with Firebase Admin
- Create iOS subscription products in App Store Connect with product IDs matching client strings
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
- After making a sandbox purchase on TestFlight, capture the transaction receipt on the device (the app should send it to backend automatically). You can also POST a saved receipt to the server verify endpoint:

curl -X POST "$API_URL/api/user/verify-premium-purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_JWT>" \
  -d '{"planId":"yearly","receipt":"<BASE64_APPLE_RECEIPT>","platform":"ios"}'

4) Quick checks
- Auth: sign up, login, logout, and confirm `user.isPro` after purchase
- Subscriptions CRUD: create/edit/delete and confirm server sync
- Local notifications: create subscription with notifyDaysBefore and ensure local scheduling runs

Notes
- The dev send-test-push route is intentionally protected by `DEV_TEST_KEY`. Set `DEV_TEST_KEY` on your deployed backend and on your local environment to use it.
- Apple production vs sandbox receipts: the server will retry the sandbox endpoint when needed (status=21007). Use sandbox receipts when testing with TestFlight.
- Push testing requires a valid APNs config in Firebase + EAS build with Push capability.

If you want, I can add automated Node scripts that call these cURL commands and validate responses; tell me if you prefer scripts or direct cURL commands.