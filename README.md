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
relies on Firebase email/password accounts so you must set `FIREBASE_API_KEY`
in your environment (the server already needs the usual admin credentials
via `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
etc.).

- `POST /api/auth/signup` – create a new Firebase account and return an
  ID token plus the fresh user object
- `POST /api/auth/login` – sign in with email/password, return ID token and
  user
- `POST /api/auth/logout` – no server state; included for symmetry with
  the frontend helpers

These endpoints are used by the frontend when a user wants to buy a
subscription.  If the caller is unauthenticated they can still operate
as a guest by creating a guest session through `/api/guest` and including
`guestId` as a query parameter on the normal APIs.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
