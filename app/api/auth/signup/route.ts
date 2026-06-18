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
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  guestId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, guestId } = signupSchema.parse(body)

    const user = await createUser(email, password, guestId)
    const token = await generateToken(user)
    const responseUser = await buildUserResponse(user)

    return createApiResponse({ token, user: responseUser }, 201)
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Signup error:', err)
    if (err?.message === 'Email already in use') {
      return createErrorResponse('An account with this email already exists.', 409)
    }
    return createErrorResponse('We could not create your account right now. Please try again.', 500)
  }
}
