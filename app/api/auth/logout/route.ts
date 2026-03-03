// backend/app/api/auth/logout/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createApiResponse } from '../../../../lib/auth'

export async function POST(request: NextRequest) {
  // Since we don't maintain sessions on the server, there's nothing to do
  // here.  The client can simply discard its token.  We still provide an
  // endpoint so the frontend code can be symmetric with the signup/login
  // helpers.
  return createApiResponse({}, 200)
}
