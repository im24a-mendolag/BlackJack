import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import prisma from '../../../../src/lib/prisma'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bankroll, hands, wins, losses, pushes, totalIncome, blackjacks, trainingHands, trainingCorrect } = await req.json()

  const data = { bankroll, hands, wins, losses, pushes }
  if (totalIncome !== undefined) data.totalIncome = totalIncome
  if (blackjacks !== undefined) data.blackjacks = blackjacks
  if (trainingHands !== undefined) data.trainingHands = trainingHands
  if (trainingCorrect !== undefined) data.trainingCorrect = trainingCorrect

  await prisma.user.update({
    where: { id: session.user.id },
    data,
  })

  return NextResponse.json({ success: true })
}
