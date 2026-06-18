// backend/app/api/auth/login/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  createApiResponse,
  createErrorResponse,
  authenticateUser,
  mergeGuestIntoUser,
  generateToken,
  buildUserResponse,
} from '../../../../lib/auth'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
  guestId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, guestId } = loginSchema.parse(body)

    let user = await authenticateUser(email, password)
    if (!user) {
      return createErrorResponse('The email or password is incorrect.', 401)
    }
    user = await mergeGuestIntoUser(user, guestId)

    const token = await generateToken(user)
    const responseUser = await buildUserResponse(user)

    return createApiResponse({ token, user: responseUser })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Login error:', err)
    return createErrorResponse('We could not sign you in right now. Please try again.', 500)
  }
}
