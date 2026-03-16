import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import prisma from '../../../../src/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, bankroll: true, hands: true, wins: true, losses: true, pushes: true, resets: true, totalIncome: true, blackjacks: true, trainingHands: true, trainingCorrect: true },
  })

  return NextResponse.json(user)
}
