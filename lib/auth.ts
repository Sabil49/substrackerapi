import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import { auth } from './firebase'
import { prisma } from './db'

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
  } catch (error) {
    return null
  }
}

const GUEST_ID_PREFIX = 'guest_'

function generateGuestId(): string {
  // Generate a server-side guest ID with reserved prefix using cryptographically secure random
  // randomBytes(16) provides 128 bits of entropy, encoded as hex for 32 characters
  const secureRandomId = randomBytes(16).toString('hex')
  return `${GUEST_ID_PREFIX}${secureRandomId}`
}

function isValidGuestId(id: string): boolean {
  // Only accept guest IDs that match the server-generated prefix
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
  // Reject guest IDs that don't match the server-generated format
  if (!isValidGuestId(guestId)) {
    throw new Error('Invalid guest ID format')
  }

  // Only fetch existing guest users, do not create
  const user = await (prisma.user as any).findUnique({
    where: { id: guestId },
  })

  // Return null if guest doesn't exist - caller must use createNewGuestUser() to create new guests
  if (!user) {
    return null
  }

  // Ensure we're returning a guest user (isGuest flag may have been added after migration)
  if (!user.isGuest) {
    throw new Error('User is not a guest account')
  }

  return user
}

export function createApiResponse(data: any, status: number = 200) {
  return Response.json(data, { status })
}

export function createErrorResponse(message: string, status: number = 400) {
  return Response.json({ error: message }, { status })
}