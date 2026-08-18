import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sports = await prisma.sport.findMany({
    where: { name: { contains: 'Badminton', mode: 'insensitive' } }
  });
  const doubles = await prisma.sport.findMany({
    where: { name: { contains: 'Doubles', mode: 'insensitive' } }
  });
  console.log("Badminton Sports:", sports.map(s => ({ id: s.id, name: s.name, requiresTeamName: s.requiresTeamName, parentId: s.parentId })));
  console.log("Doubles Sports:", doubles.map(s => ({ id: s.id, name: s.name, requiresTeamName: s.requiresTeamName, parentId: s.parentId })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
