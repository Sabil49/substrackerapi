// backend/lib/auth.ts
import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import type * as admin from 'firebase-admin'
import { auth } from './firebase'
import { prisma } from './db'

// When we need to exchange credentials for an ID token we call the
// Identity Toolkit REST endpoints. The API key is stored in an env var.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY
if (!FIREBASE_API_KEY) {
  // We don't throw at import time so that other operations (guest, etc.)
  // still work in environments that don't have an API key (e.g. tests).
}

// generic helper for signing in via the REST API (used by login and
// signup to obtain an ID token that clients can use in Authorization
// headers).
export async function signInWithEmailAndPassword(
  email: string,
  password: string,
): Promise<{ idToken: string; localId: string }> {
  if (!FIREBASE_API_KEY) {
    throw new Error('FIREBASE_API_KEY is not defined')
  }

  const url =
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' +
    FIREBASE_API_KEY
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json()

  if (!res.ok) {
    const msg = data.error?.message || 'Failed to sign in'
    throw new Error(msg)
  }

  return { idToken: data.idToken, localId: data.localId }
}

// helper that will create or look up a prisma user based on a decoded
// firebase token.  the logic used to live inside getUserFromRequest; we
// factor it out so both the auth routes and the request middleware can
// reuse it.
export async function getOrCreateUserFromDecodedToken(
  decodedToken: admin.auth.DecodedIdToken,
) {
  let user = await (prisma.user as any).findUnique({
    where: { firebaseUid: decodedToken.uid },
  })

  if (!user) {
    if (!decodedToken.email) {
      throw new Error('Email is required for user creation')
    }
    user = await prisma.user.create({
      data: {
        firebaseUid: decodedToken.uid,
        email: decodedToken.email,
      },
    })
  }

  return user
}

export async function verifyFirebaseToken(token: string) {
  try {
    const decodedToken = await auth.verifyIdToken(token)
    return decodedToken
  } catch (error) {
    throw new Error('Invalid token')
  }
}

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)

  try {
    const decodedToken = await verifyFirebaseToken(token)
    return await getOrCreateUserFromDecodedToken(decodedToken)
  } catch (error) {
    return null
  }
}

const GUEST_ID_PREFIX = 'guest_'

// helper to build the user object we send back to the client
export async function buildUserResponse(user: any) {
  const subscriptionCount = await (prisma.subscription as any).count({
    where: {
      userId: user.id,
      isActive: true,
    },
  })

  return {
    id: user.id,
    email: user.email || null,
    isPro: user.isPro,
    proExpiresAt: user.proExpiresAt || null,
    subscriptionCount,
    subscriptionLimit: user.isPro ? null : 5,
  }
}


function generateGuestId(): string {
  const secureRandomId = randomBytes(16).toString('hex')
  return `${GUEST_ID_PREFIX}${secureRandomId}`
}

function isValidGuestId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(GUEST_ID_PREFIX)
}

export async function createNewGuestUser() {
  const guestId = generateGuestId()
  const user = await prisma.user.create({
    data: {
      id: guestId,
      isGuest: true,
    },
  })
  return user
}

export async function getGuestUser(guestId: string) {
  if (!isValidGuestId(guestId)) {
    return null
  }

  const user = await (prisma.user as any).findUnique({
    where: { id: guestId },
  })

  if (!user || !user.isGuest) {
    return null
  }

  return user
}

export function createApiResponse(data: any, status: number = 200) {
  return Response.json(data, { status })
}

export function createErrorResponse(message: string, status: number = 400) {
  return Response.json({ error: message }, { status })
}