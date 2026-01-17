export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { prisma } from '../../../lib/db'
import { createApiResponse, createErrorResponse } from '../../../lib/auth'

export async function GET(request: NextRequest) {
  try {
    const templates = await (prisma.template as any).findMany({
      orderBy: {
        name: 'asc',
      },
    })

    if (templates.length === 0) {
      const defaultTemplates = [
        { name: 'Netflix', category: 'Entertainment', iconUrl: '🎬', color: '#E50914', avgPrice: 15.99 },
        { name: 'Spotify', category: 'Entertainment', iconUrl: '🎵', color: '#1DB954', avgPrice: 10.99 },
        { name: 'Disney+', category: 'Entertainment', iconUrl: '🎭', color: '#113CCF', avgPrice: 10.99 },
        { name: 'Apple Music', category: 'Entertainment', iconUrl: '🎵', color: '#FC3C44', avgPrice: 10.99 },
        { name: 'YouTube Premium', category: 'Entertainment', iconUrl: '📺', color: '#FF0000', avgPrice: 13.99 },
        { name: 'Amazon Prime', category: 'Shopping', iconUrl: '📦', color: '#FF9900', avgPrice: 14.99 },
        { name: 'HBO Max', category: 'Entertainment', iconUrl: '🎬', color: '#7C3AED', avgPrice: 15.99 },
        { name: 'Hulu', category: 'Entertainment', iconUrl: '📺', color: '#1CE783', avgPrice: 14.99 },
        { name: 'Adobe Creative Cloud', category: 'Work', iconUrl: '🎨', color: '#DA1F26', avgPrice: 54.99 },
        { name: 'Microsoft 365', category: 'Work', iconUrl: '💼', color: '#D83B01', avgPrice: 6.99 },
        { name: 'iCloud+', category: 'Storage', iconUrl: '☁️', color: '#007AFF', avgPrice: 2.99 },
        { name: 'Google One', category: 'Storage', iconUrl: '☁️', color: '#4285F4', avgPrice: 1.99 },
        { name: 'Dropbox', category: 'Storage', iconUrl: '📁', color: '#0061FF', avgPrice: 11.99 },
        { name: 'GitHub Pro', category: 'Work', iconUrl: '💻', color: '#171515', avgPrice: 4.00 },
        { name: 'ChatGPT Plus', category: 'Work', iconUrl: '🤖', color: '#10A37F', avgPrice: 20.00 },
        { name: 'Notion', category: 'Work', iconUrl: '📝', color: '#000000', avgPrice: 10.00 },
        { name: 'Figma', category: 'Work', iconUrl: '🎨', color: '#F24E1E', avgPrice: 15.00 },
        { name: 'Canva Pro', category: 'Work', iconUrl: '🎨', color: '#00C4CC', avgPrice: 12.99 },
        { name: 'Grammarly', category: 'Work', iconUrl: '✍️', color: '#15C39A', avgPrice: 12.00 },
        { name: 'LinkedIn Premium', category: 'Work', iconUrl: '💼', color: '#0A66C2', avgPrice: 29.99 },
        { name: 'Peloton', category: 'Fitness', iconUrl: '🚴', color: '#CB2026', avgPrice: 44.00 },
        { name: 'Planet Fitness', category: 'Fitness', iconUrl: '🏋️', color: '#7D3EC2', avgPrice: 24.99 },
        { name: 'ClassPass', category: 'Fitness', iconUrl: '🏃', color: '#00D4A1', avgPrice: 79.00 },
        { name: 'Headspace', category: 'Health', iconUrl: '🧘', color: '#F47E3C', avgPrice: 12.99 },
        { name: 'Calm', category: 'Health', iconUrl: '🌊', color: '#2C52D1', avgPrice: 14.99 },
      ]

      await prisma.template.createMany({
        data: defaultTemplates,
        skipDuplicates: true,
      })

      // Re-fetch to get actual records with generated fields
      const seededTemplates = await (prisma.template as any).findMany({
        orderBy: { name: 'asc' },
      })
      return createApiResponse({ templates: seededTemplates })
    }
    return createApiResponse({ templates })
  } catch (error) {
    console.error('Get templates error:', error)
    return createErrorResponse('Failed to fetch templates', 500)
  }
}