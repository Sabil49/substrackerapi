// backend/app/api/auth/signup/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth as firebaseAuth } from '../../../../lib/firebase'
import { prisma } from '../../../../lib/db'
import {
  createApiResponse,
  createErrorResponse,
  signInWithEmailAndPassword,
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

    // create the Firebase account first
    const userRecord = await firebaseAuth.createUser({ email, password })

    // sign in using the REST API so we can send the ID token back to the
    // client. the web SDK normally does this for us but here we're doing it
    // on the server.
    const { idToken } = await signInWithEmailAndPassword(email, password)

    // make sure there is a corresponding row in our database
    let user = await (prisma.user as any).findUnique({
      where: { firebaseUid: userRecord.uid },
    })
    if (!user) {
      user = await (prisma.user as any).create({
        data: { firebaseUid: userRecord.uid, email },
      })
    }

    const responseUser = await buildUserResponse(user)
    return createApiResponse({ token: idToken, user: responseUser }, 201)
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return createErrorResponse(err.errors[0].message, 400)
    }
    console.error('Signup error:', err)
    return createErrorResponse(err.message || 'Failed to sign up', 500)
  }
}
