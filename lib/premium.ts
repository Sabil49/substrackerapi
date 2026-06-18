import { prisma } from './db'

export function hasActivePremium(user: {
  isPro: boolean
  proExpiresAt?: Date | string | null
}) {
  if (!user.isPro) return false
  if (!user.proExpiresAt) return true
  return new Date(user.proExpiresAt).getTime() > Date.now()
}

export async function syncPremiumStatus<T extends {
  id: string
  isPro: boolean
  proExpiresAt?: Date | string | null
}>(user: T): Promise<T> {
  if (!user.isPro || hasActivePremium(user)) return user

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isPro: false,
      proAutoRenewing: false,
      proUpdatedAt: new Date(),
    },
  })
  return updated as unknown as T
}
