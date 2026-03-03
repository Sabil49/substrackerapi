// backend/app/api/auth/login/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  verifyFirebaseToken,
  createApiResponse,
  createErrorResponse,
  signInWithEmailAndPassword,
  getOrCreateUserFromDecodedToken,
  buildUserResponse,
} from '../../../../lib/auth'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    const { idToken } = await signInWithEmailAndPassword(email, password)

    const decoded = await verifyFirebaseToken(idToken)
    const user = await getOrCreateUserFromDecodedToken(decoded)
    const responseUser = await buildUserResponse(user)

    return createApiResponse({ token: idToken, user: responseUser })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Login error:', err)
    return createErrorResponse(err.message || 'Failed to log in', 500)
  }
}
