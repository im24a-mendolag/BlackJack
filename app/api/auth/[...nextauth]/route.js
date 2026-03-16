import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from '../../../../src/lib/prisma'

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        return {
          id: user.id,
          username: user.username,
          bankroll: user.bankroll,
          hands: user.hands,
          wins: user.wins,
          losses: user.losses,
          pushes: user.pushes,
          totalIncome: user.totalIncome,
          blackjacks: user.blackjacks,
          trainingHands: user.trainingHands,
          trainingCorrect: user.trainingCorrect,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.username = user.username
        token.bankroll = user.bankroll
        token.hands = user.hands
        token.wins = user.wins
        token.losses = user.losses
        token.pushes = user.pushes
        token.totalIncome = user.totalIncome
        token.blackjacks = user.blackjacks
        token.trainingHands = user.trainingHands
        token.trainingCorrect = user.trainingCorrect
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.username = token.username
      session.user.bankroll = token.bankroll
      session.user.hands = token.hands
      session.user.wins = token.wins
      session.user.losses = token.losses
      session.user.pushes = token.pushes
      session.user.totalIncome = token.totalIncome
      session.user.blackjacks = token.blackjacks
      session.user.trainingHands = token.trainingHands
      session.user.trainingCorrect = token.trainingCorrect
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
