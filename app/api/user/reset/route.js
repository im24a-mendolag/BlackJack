import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import prisma from '../../../../src/lib/prisma'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { bankroll: 1000, hands: 0, wins: 0, losses: 0, pushes: 0, totalIncome: 0, blackjacks: 0, resets: { increment: 1 } },
  })

  return NextResponse.json({ success: true })
}
