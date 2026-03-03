// backend/lib/auth.ts
import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from './db'

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'change_me'
const JWT_EXPIRY = '7d'


// password and token helpers
function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function generateToken(user: any) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

export async function verifyToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    return payload
  } catch {
    throw new Error('Invalid token')
  }
}

export async function createUser(email: string, password: string) {
  const existing = await (prisma.user as any).findUnique({ where: { email } })
  if (existing) throw new Error('Email already in use')
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { email, passwordHash } })
  return user
}

export async function authenticateUser(email: string, password: string) {
  const user = await (prisma.user as any).findUnique({ where: { email } })
  if (!user || !user.passwordHash) return null
  const ok = await comparePassword(password, user.passwordHash)
  if (!ok) return null
  return user
}

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.substring(7)
  try {
    const { userId } = await verifyToken(token)
    const user = await (prisma.user as any).findUnique({ where: { id: userId } })
    return user
  } catch (_err) {
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