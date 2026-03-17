import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import prisma from '../../../../src/lib/prisma'

// Increments the resets counter only — used when a forced bankroll reset
// occurs in multiplayer (bankroll hit 0). Does not wipe other stats.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { resets: { increment: 1 } },
  })

  return NextResponse.json({ success: true })
}
