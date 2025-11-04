import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export const db = {
  getReplies: ({ sinceHours }: { sinceHours: number }) =>
    prisma.reply.findMany({
      where: { sentAt: { gte: new Date(Date.now() - sinceHours * 3600_000) } }
    }),
};