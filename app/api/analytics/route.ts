// backend/app/api/analytics/route.ts
export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../../../lib/db'
import { getUserFromRequest, getGuestUser, createApiResponse, createErrorResponse } from '../../../lib/auth'

interface Subscription {
  id: string;
  name: string;
  amount: Decimal;
  currency: string;
  nextBillingDate: Date;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  category?: string;
  customCycleDays?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const guestId = searchParams.get('guestId')
    
    let user
    if (guestId) {
      user = await getGuestUser(guestId)
    } else {
      user = await getUserFromRequest(request)
    }

    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const subscriptions = await (prisma.subscription as any).findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
    })

    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    let monthlyTotal = 0
    let yearlyTotal = 0
    const categoryBreakdown: Record<string, number> = {}
    const upcomingCharges: Array<{
      id: string
      name: string
      amount: number
      currency: string
      nextBillingDate: Date
      daysUntil: number
    }> = []

    subscriptions.forEach((sub:Subscription) => {
      const nextBilling = new Date(sub.nextBillingDate)

      let monthlyAmount = 0
      let yearlyAmount = 0
      const amount = typeof sub.amount === 'object' ? sub.amount.toNumber() : sub.amount

      switch (sub.billingCycle) {
        case 'WEEKLY':
          monthlyAmount = amount * 4.33
          yearlyAmount = amount * 52
          break
        case 'MONTHLY':
          monthlyAmount = amount
          yearlyAmount = amount * 12
          break
        case 'YEARLY':
          monthlyAmount = amount / 12
          yearlyAmount = amount
          break
        case 'CUSTOM':
          if (sub.customCycleDays) {
            const cyclesPerYear = 365 / sub.customCycleDays
            yearlyAmount = amount * cyclesPerYear
            monthlyAmount = yearlyAmount / 12
          }
          break
        default:
          console.warn(`Unknown billing cycle: ${sub.billingCycle}, treating as monthly`)
          monthlyAmount = amount
          yearlyAmount = amount * 12
      }
      monthlyTotal += monthlyAmount
      yearlyTotal += yearlyAmount

      const category = sub.category || 'Other'
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + monthlyAmount

      if (nextBilling >= now && nextBilling <= endOfMonth) {
        const daysUntil = Math.ceil((nextBilling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        upcomingCharges.push({
          id: sub.id,
          name: sub.name,
          amount: typeof sub.amount === 'object' ? sub.amount.toNumber() : sub.amount,
          currency: sub.currency,
          nextBillingDate: nextBilling,
          daysUntil,
        })
      }
    })

    upcomingCharges.sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime())

    const mostExpensive = subscriptions.reduce((max: Subscription | undefined, sub: Subscription) => {
      let monthlyAmount = 0
      const subAmount = typeof sub.amount === 'object' ? sub.amount.toNumber() : sub.amount
      switch (sub.billingCycle) {
        case 'WEEKLY':
          monthlyAmount = subAmount * 4.33
          break
        case 'MONTHLY':
          monthlyAmount = subAmount
          break
        case 'YEARLY':
          monthlyAmount = subAmount / 12
          break
        case 'CUSTOM':
          if (sub.customCycleDays) {
            monthlyAmount = (subAmount * 365) / sub.customCycleDays / 12
          }
          break
      }

      let maxMonthly = 0
      if (max) {
        const maxAmount = typeof max.amount === 'object' ? max.amount.toNumber() : max.amount
        switch (max.billingCycle) {
          case 'WEEKLY':
            maxMonthly = maxAmount * 4.33
            break
          case 'MONTHLY':
            maxMonthly = maxAmount
            break
          case 'YEARLY':
            maxMonthly = maxAmount / 12
            break
          case 'CUSTOM':
            if (max.customCycleDays) {
              maxMonthly = (maxAmount * 365) / max.customCycleDays / 12
            }
            break
        }
      }

      return monthlyAmount > maxMonthly ? sub : max
    }, subscriptions[0])
    // Round categoryBreakdown values
    const roundedCategoryBreakdown = Object.fromEntries(
      Object.entries(categoryBreakdown).map(([key, value]) => [
        key,
        Math.round(value * 100) / 100
      ])
    )

    return createApiResponse({
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      yearlyTotal: Math.round(yearlyTotal * 100) / 100,
      totalSubscriptions: subscriptions.length,
      categoryBreakdown: roundedCategoryBreakdown,
      upcomingCharges,
      mostExpensive: mostExpensive ? {
        id: mostExpensive.id,
        name: mostExpensive.name,
        amount: typeof mostExpensive.amount === 'object' ? mostExpensive.amount.toNumber() : mostExpensive.amount,
        currency: mostExpensive.currency,
      } : null,
    })
  } catch (error) {
    console.error('Get analytics error:', error)
    return createErrorResponse('Failed to fetch analytics', 500)
  }
}