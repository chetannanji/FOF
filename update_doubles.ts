import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.sport.updateMany({
    where: { 
      name: { contains: 'Doubles', mode: 'insensitive' }
    },
    data: {
      requiresTeamName: true
    }
  });
  console.log(`Updated ${result.count} sports with 'Doubles' in their name to require a team name.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
