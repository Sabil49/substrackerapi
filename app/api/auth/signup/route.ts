// backend/app/api/auth/signup/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  createApiResponse,
  createErrorResponse,
  createUser,
  generateToken,
  buildUserResponse,
} from '../../../../lib/auth'

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = signupSchema.parse(body)

    const user = await createUser(email, password)
    const token = await generateToken(user)
    const responseUser = await buildUserResponse(user)

    return createApiResponse({ token, user: responseUser }, 201)
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Signup error:', err)
    return createErrorResponse(err.message || 'Failed to sign up', 500)
  }
}
