import { createApiResponse } from '../../../lib/auth'

export async function GET() {
  return createApiResponse({ status: 'ok' })
}
