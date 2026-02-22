// backend/lib/auth.ts
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