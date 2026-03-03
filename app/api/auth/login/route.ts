// backend/app/api/auth/login/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  createApiResponse,
  createErrorResponse,
  authenticateUser,
  generateToken,
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

    const user = await authenticateUser(email, password)
    if (!user) {
      return createErrorResponse('Invalid credentials', 401)
    }

    const token = await generateToken(user)
    const responseUser = await buildUserResponse(user)

    return createApiResponse({ token, user: responseUser })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Login error:', err)
    return createErrorResponse(err.message || 'Failed to log in', 500)
  }
}
