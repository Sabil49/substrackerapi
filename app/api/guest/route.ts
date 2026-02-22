export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { createNewGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await createNewGuestUser()
    return createApiResponse({ guestId: user.id }, 201)
  } catch (error) {
    console.error('Create guest error:', error)
    return createErrorResponse('Failed to create guest session', 500)
  }
}