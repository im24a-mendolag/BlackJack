import { NextResponse } from 'next/server'
import prisma from '../../../src/lib/prisma'

export async function GET() {
  const [income, training, resets] = await Promise.all([
    prisma.user.findMany({
      orderBy: { totalIncome: 'desc' },
      take: 10,
      select: { username: true, totalIncome: true, hands: true },
    }),
    prisma.user.findMany({
      where: { trainingHands: { gt: 0 } },
      orderBy: { trainingHands: 'desc' },
      take: 10,
      select: { username: true, trainingHands: true, trainingCorrect: true },
    }),
    prisma.user.findMany({
      where: { resets: { gt: 0 } },
      orderBy: { resets: 'desc' },
      take: 10,
      select: { username: true, resets: true },
    }),
  ])

  return NextResponse.json({ income, training, resets })
}
