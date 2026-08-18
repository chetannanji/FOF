import { PrismaClient, Role, Gender, ParticipantStatus, SportType, MedalType } from "@prisma/client";
import bcrypt from "bcrypt";
import { normalizeDatabaseUrl } from "../src/utils/database";

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

try {
  const { hostname, port, protocol } = new URL(databaseUrl);
  console.log(`Seeding database via: ${protocol}//${hostname}${port ? `:${port}` : ""}`);
} catch (error) {
  console.warn("Unable to determine database connection target for seeding:", error);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log("Seeding database...");

  // Clear existing data (optional - comment out if you want to keep existing data)
  // await prisma.email.deleteMany();
  // await prisma.calendarItem.deleteMany();
  // await prisma.participantSport.deleteMany();
  // await prisma.participant.deleteMany();
  // await prisma.volunteer.deleteMany();
  // await prisma.user.deleteMany();
  // await prisma.sport.deleteMany();
  // await prisma.community.deleteMany();
  // await prisma.department.deleteMany();
  // await prisma.settings.deleteMany();

  // Create departments
  const dept1 = await prisma.department.upsert({
    where: { id: "d1" },
    update: {},
    create: {
      id: "d1",
      name: "Event Coordination",
    },
  });

  const dept2 = await prisma.department.upsert({
    where: { id: "d2" },
    update: {},
    create: {
      id: "d2",
      name: "Medical Support",
    },
  });

  // Create communities
  const comm1 = await prisma.community.upsert({
    where: { id: "1" },
    update: {},
    create: {
      id: "1",
      name: "Nairobi Central",
      active: true,
      contactPerson: "Ahmed Hassan",
      phone: "+254 712 111 111",
      email: "nairobi.central@fof.co.ke",
      adminUsername: "commadmin1",
      adminEmail: "commadmin1@fof.co.ke",
    },
  });

  const comm2 = await prisma.community.upsert({
    where: { id: "2" },
    update: {},
    create: {
      id: "2",
      name: "Westlands",
      active: true,
      contactPerson: "Jennifer Muthoni",
      phone: "+254 723 222 222",
      email: "westlands@fof.co.ke",
      adminUsername: "commadmin2",
      adminEmail: "commadmin2@fof.co.ke",
    },
  });

  const comm3 = await prisma.community.upsert({
    where: { id: "3" },
    update: {},
    create: {
      id: "3",
      name: "Parklands",
      active: true,
      contactPerson: "David Kimani",
      phone: "+254 734 333 333",
      email: "parklands@fof.co.ke",
    },
  });

  const comm4 = await prisma.community.upsert({
    where: { id: "4" },
    update: {},
    create: {
      id: "4",
      name: "Kilimani",
      active: true,
      contactPerson: "Sarah Wanjiku",
      phone: "+254 745 444 444",
      email: "kilimani@fof.co.ke",
    },
  });

  const comm5 = await prisma.community.upsert({
    where: { id: "5" },
    update: {},
    create: {
      id: "5",
      name: "Lavington",
      active: true,
      contactPerson: "James Ochieng",
      phone: "+254 756 555 555",
      email: "lavington@fof.co.ke",
    },
  });

  const comm6 = await prisma.community.upsert({
    where: { id: "6" },
    update: {},
    create: {
      id: "6",
      name: "Karen",
      active: true,
      contactPerson: "Mary Njeri",
      phone: "+254 767 666 666",
      email: "karen@fof.co.ke",
    },
  });

  // Create sports
  const sport1 = await prisma.sport.upsert({
    where: { id: "1" },
    update: {
      rules: `**Football Rules - FOF 2026**

1. Each match will consist of two 30-minute halves
2. Teams must have 11 players on the field
3. Standard FIFA rules apply
4. Fair play and sportsmanship are mandatory
5. Yellow and red card system will be enforced`,
    },
    create: {
      id: "1",
      name: "Football",
      active: true,
      type: SportType.team,
      requiresTeamName: true,
      adminUsername: "footballadmin",
      adminEmail: "football@fof.co.ke",
      rules: `**Football Rules - FOF 2026**

1. Each match will consist of two 30-minute halves
2. Teams must have 11 players on the field
3. Standard FIFA rules apply
4. Fair play and sportsmanship are mandatory
5. Yellow and red card system will be enforced`,
    },
  });

  const sport2 = await prisma.sport.upsert({
    where: { id: "2" },
    update: {
      rules: `**Basketball Rules - FOF 2026**

1. Games consist of four 10-minute quarters
2. Five players per team on court
3. Standard FIBA rules apply
4. Shot clock: 24 seconds
5. Three-point line distance: 6.75m`,
    },
    create: {
      id: "2",
      name: "Basketball",
      active: true,
      type: SportType.team,
      requiresTeamName: true,
      adminUsername: "basketballadmin",
      adminEmail: "basketball@fof.co.ke",
      rules: `**Basketball Rules - FOF 2026**

1. Games consist of four 10-minute quarters
2. Five players per team on court
3. Standard FIBA rules apply
4. Shot clock: 24 seconds
5. Three-point line distance: 6.75m`,
    },
  });

  const sport4 = await prisma.sport.upsert({
    where: { id: "4" },
    update: {
      rules: `**Athletics Rules - FOF 2026**

1. All events follow IAAF regulations
2. Participants must report 30 minutes before their event
3. Proper athletic attire required
4. False starts result in disqualification
5. Results based on timing/distance measurements`,
    },
    create: {
      id: "4",
      name: "Athletics",
      active: true,
      type: SportType.individual,
      requiresTeamName: false,
      adminUsername: "athleticsadmin",
      adminEmail: "athletics@fof.co.ke",
      rules: `**Athletics Rules - FOF 2026**

1. All events follow IAAF regulations
2. Participants must report 30 minutes before their event
3. Proper athletic attire required
4. False starts result in disqualification
5. Results based on timing/distance measurements`,
    },
  });

  const sport10 = await prisma.sport.upsert({
    where: { id: "10" },
    update: {
      rules: `**Badminton Rules - FOF 2026**

1. Best of 3 sets format
2. First to 21 points wins a set (must win by 2)
3. Standard BWF rules apply
4. Proper badminton shoes required
5. Shuttlecock provided by organizers`,
    },
    create: {
      id: "10",
      name: "Badminton",
      active: true,
      type: SportType.individual,
      requiresTeamName: false,
      adminUsername: "badmintonadmin",
      adminEmail: "badminton@fof.co.ke",
      rules: `**Badminton Rules - FOF 2026**

1. Best of 3 sets format
2. First to 21 points wins a set (must win by 2)
3. Standard BWF rules apply
4. Proper badminton shoes required
5. Shuttlecock provided by organizers`,
    },
  });

  await prisma.sport.upsert({
    where: { id: "10a" },
    update: {},
    create: {
      id: "10a",
      name: "Singles",
      active: true,
      type: SportType.individual,
      requiresTeamName: false,
      parentId: "10",
    },
  });

  await prisma.sport.upsert({
    where: { id: "10b" },
    update: {},
    create: {
      id: "10b",
      name: "Doubles",
      active: true,
      type: SportType.team,
      requiresTeamName: false,
      parentId: "10",
    },
  });

  await prisma.sport.upsert({
    where: { id: "10c" },
    update: {},
    create: {
      id: "10c",
      name: "Mixed Doubles",
      active: true,
      type: SportType.team,
      requiresTeamName: false,
      parentId: "10",
    },
  });

  const sport11 = await prisma.sport.upsert({
    where: { id: "11" },
    update: {},
    create: {
      id: "11",
      name: "Darts",
      active: true,
      type: SportType.individual,
      requiresTeamName: false,
    },
  });

  await prisma.sport.upsert({
    where: { id: "11a" },
    update: {},
    create: {
      id: "11a",
      name: "Singles",
      active: true,
      type: SportType.individual,
      requiresTeamName: false,
      parentId: "11",
    },
  });

  await prisma.sport.upsert({
    where: { id: "11b" },
    update: {},
    create: {
      id: "11b",
      name: "Doubles",
      active: true,
      type: SportType.team,
      requiresTeamName: false,
      parentId: "11",
    },
  });

  // Create users with hashed passwords
  const adminPassword = await hashPassword("admin");
  await prisma.user.upsert({
    where: { id: "u1" },
    update: {},
    create: {
      id: "u1",
      username: "admin",
      email: "admin@fof.co.ke",
      password: adminPassword,
      role: Role.admin,
    },
  });

  const communityPassword = await hashPassword("community");
  await prisma.user.upsert({
    where: { id: "c1" },
    update: {},
    create: {
      id: "c1",
      username: "commadmin1",
      email: "commadmin1@fof.co.ke",
      password: communityPassword,
      role: Role.community_admin,
      communityId: "1",
    },
  });

  await prisma.user.upsert({
    where: { id: "c2" },
    update: {},
    create: {
      id: "c2",
      username: "commadmin2",
      email: "commadmin2@fof.co.ke",
      password: communityPassword,
      role: Role.community_admin,
      communityId: "2",
    },
  });

  const footballPassword = await hashPassword("football");
  await prisma.user.upsert({
    where: { id: "s1" },
    update: {},
    create: {
      id: "s1",
      username: "footballadmin",
      email: "football@fof.co.ke",
      password: footballPassword,
      role: Role.sports_admin,
      sportId: "1",
    },
  });

  const footballSuperPassword = await hashPassword("footballsuper");
  await prisma.user.upsert({
    where: { id: "ss1" },
    update: { role: Role.sports_super_admin, sportId: null },
    create: {
      id: "ss1",
      username: "footballsuper",
      email: "football-super@fof.co.ke",
      password: footballSuperPassword,
      role: Role.sports_super_admin,
    },
  });

  const basketballPassword = await hashPassword("basketball");
  await prisma.user.upsert({
    where: { id: "s2" },
    update: {},
    create: {
      id: "s2",
      username: "basketballadmin",
      email: "basketball@fof.co.ke",
      password: basketballPassword,
      role: Role.sports_admin,
      sportId: "2",
    },
  });

  const athleticsPassword = await hashPassword("athletics");
  await prisma.user.upsert({
    where: { id: "s3" },
    update: {},
    create: {
      id: "s3",
      username: "athleticsadmin",
      email: "athletics@fof.co.ke",
      password: athleticsPassword,
      role: Role.sports_admin,
      sportId: "4",
    },
  });

  const badmintonPassword = await hashPassword("badminton");
  await prisma.user.upsert({
    where: { id: "s4" },
    update: {},
    create: {
      id: "s4",
      username: "badmintonadmin",
      email: "badminton@fof.co.ke",
      password: badmintonPassword,
      role: Role.sports_admin,
      sportId: "10",
    },
  });

  const voladminPassword = await hashPassword("voladmin");
  await prisma.user.upsert({
    where: { id: "vadmin" },
    update: {},
    create: {
      id: "vadmin",
      username: "voladmin",
      email: "voladmin@fof.co.ke",
      password: voladminPassword,
      role: Role.volunteer_admin,
    },
  });

  const userPassword = await hashPassword("user");
  await prisma.user.upsert({
    where: { id: "u2" },
    update: {},
    create: {
      id: "u2",
      username: "user",
      email: "user@fof.co.ke",
      password: userPassword,
      role: Role.user,
    },
  });

  // Create participants
  const participant1 = await prisma.participant.upsert({
    where: { id: "p1" },
    update: {},
    create: {
      id: "p1",
      firstName: "Asha",
      lastName: "Mwangi",
      gender: Gender.female,
      dob: new Date("2004-05-12"),
      email: "asha.mwangi@example.com",
      phone: "+254711000001",
      communityId: "1",
      nextOfKin: {
        firstName: "Mary",
        lastName: "Mwangi",
        phone: "+254711222333",
      },
      status: ParticipantStatus.pending,
      teamName: "Nairobi Queens",
    },
  });

  await prisma.participantSport.upsert({
    where: {
      participantId_sportId: {
        participantId: participant1.id,
        sportId: "1",
      },
    },
    update: {},
    create: {
      participantId: participant1.id,
      sportId: "1",
    },
  });

  const participant2 = await prisma.participant.upsert({
    where: { id: "p2" },
    update: {},
    create: {
      id: "p2",
      firstName: "Brian",
      lastName: "Otieno",
      gender: Gender.male,
      dob: new Date("2003-09-22"),
      email: "brian.otieno@example.com",
      phone: "+254711000002",
      communityId: "2",
      nextOfKin: {
        firstName: "Peter",
        lastName: "Otieno",
        phone: "+254722111444",
      },
      status: ParticipantStatus.accepted,
    },
  });

  await prisma.participantSport.createMany({
    data: [
      { participantId: participant2.id, sportId: "2" },
      { participantId: participant2.id, sportId: "4" },
    ],
    skipDuplicates: true,
  });

  // Create volunteers
  const volunteers = [
    {
      id: "volDemo",
      username: "volunteer",
      firstName: "Demo",
      lastName: "Volunteer",
      gender: Gender.female,
      dob: new Date("1998-01-01"),
      email: "volunteer@fof.co.ke",
      phone: "+254733000000",
      departmentId: "d1",
      sportId: "1",
    },
    {
      id: "vol1",
      username: "grace_vol",
      firstName: "Grace",
      lastName: "Kariuki",
      gender: Gender.female,
      dob: new Date("1999-01-10"),
      email: "grace.kariuki@example.com",
      phone: "+254733100200",
      departmentId: "d1",
      sportId: "1",
    },
    {
      id: "vol2",
      username: "hassan_vol",
      firstName: "Hassan",
      lastName: "Ali",
      gender: Gender.male,
      dob: new Date("1997-07-18"),
      email: "hassan.ali@example.com",
      phone: "+254733100201",
      departmentId: "d2",
      sportId: "2",
    },
    {
      id: "vol3",
      username: "linet_vol",
      firstName: "Linet",
      lastName: "Chebet",
      gender: Gender.female,
      dob: new Date("2000-03-03"),
      email: "linet.chebet@example.com",
      phone: "+254733100202",
      departmentId: "d1",
      sportId: "4",
    },
    {
      id: "vol4",
      username: "peter_vol",
      firstName: "Peter",
      lastName: "Mwangi",
      gender: Gender.male,
      dob: new Date("1995-05-15"),
      email: "peter.mwangi@example.com",
      phone: "+254733100203",
      departmentId: "d1",
    },
    {
      id: "vol5",
      username: "sarah_vol",
      firstName: "Sarah",
      lastName: "Wanjiku",
      gender: Gender.female,
      dob: new Date("1998-08-22"),
      email: "sarah.wanjiku@example.com",
      phone: "+254733100204",
      departmentId: "d2",
    },
    {
      id: "vol6",
      username: "david_vol",
      firstName: "David",
      lastName: "Ochieng",
      gender: Gender.male,
      dob: new Date("1996-11-30"),
      email: "david.ochieng@example.com",
      phone: "+254733100205",
      departmentId: "d1",
    },
    {
      id: "vol7",
      username: "mary_vol",
      firstName: "Mary",
      lastName: "Njeri",
      gender: Gender.female,
      dob: new Date("1999-02-14"),
      email: "mary.njeri@example.com",
      phone: "+254733100206",
      departmentId: "d2",
    },
    {
      id: "vol8",
      username: "james_vol",
      firstName: "James",
      lastName: "Kipchoge",
      gender: Gender.male,
      dob: new Date("1994-09-10"),
      email: "james.kipchoge@example.com",
      phone: "+254733100207",
      departmentId: "d1",
    },
    {
      id: "vol9",
      username: "ruth_vol",
      firstName: "Ruth",
      lastName: "Kamau",
      gender: Gender.female,
      dob: new Date("2001-06-25"),
      email: "ruth.kamau@example.com",
      phone: "+254733100208",
      departmentId: "d2",
    },
    {
      id: "vol10",
      username: "michael_vol",
      firstName: "Michael",
      lastName: "Mutua",
      gender: Gender.male,
      dob: new Date("1997-12-05"),
      email: "michael.mutua@example.com",
      phone: "+254733100209",
      departmentId: "d1",
    },
  ];

  const volunteerSeedPassword = await hashPassword("volunteer");

  for (const vol of volunteers) {
    const { username, ...volunteerData } = vol;
    const volunteerUser = await prisma.user.upsert({
      where: { username },
      update: {
        email: volunteerData.email,
        password: volunteerSeedPassword,
        role: Role.volunteer,
      },
      create: {
        username,
        email: volunteerData.email,
        password: volunteerSeedPassword,
        role: Role.volunteer,
      },
    });

    await prisma.volunteer.upsert({
      where: { id: volunteerData.id },
      update: {
        ...volunteerData,
        userId: volunteerUser.id,
      },
      create: {
        ...volunteerData,
        userId: volunteerUser.id,
      },
    });
  }

  // Create user and volunteer for nikhilkumarsingh7174@gmail.com
  const nikhilPassword = await hashPassword("password123");
  const nikhilUsername = "nikhilkumar_" + Date.now().toString().slice(-6);
  
  const nikhilUser = await prisma.user.upsert({
    where: { email: "nikhilkumarsingh7174@gmail.com" },
    update: {
      username: nikhilUsername,
      password: nikhilPassword,
      role: Role.volunteer,
    },
    create: {
      username: nikhilUsername,
      email: "nikhilkumarsingh7174@gmail.com",
      password: nikhilPassword,
      role: Role.volunteer,
    },
  });

  await prisma.volunteer.upsert({
    where: { email: "nikhilkumarsingh7174@gmail.com" },
    update: {
      firstName: "Nikhil",
      middleName: undefined,
      lastName: "Singh",
      gender: Gender.male,
      dob: new Date("1995-01-01"),
      phone: "+254 700 000 000",
      sportId: "1",
      userId: nikhilUser.id,
    },
    create: {
      firstName: "Nikhil",
      lastName: "Singh",
      gender: Gender.male,
      dob: new Date("1995-01-01"),
      email: "nikhilkumarsingh7174@gmail.com",
      phone: "+254 700 000 000",
      sportId: "1", // Assigned to Football
      userId: nikhilUser.id,
    },
  });

  // Create calendar items
  await prisma.calendarItem.upsert({
    where: { id: "e1" },
    update: {},
    create: {
      id: "e1",
      sportId: "1",
      date: new Date("2026-11-15"),
      time: "09:00",
      venue: "Main Stadium",
      type: "Qualifier",
    },
  });

  await prisma.calendarItem.upsert({
    where: { id: "e2" },
    update: {},
    create: {
      id: "e2",
      sportId: "2",
      date: new Date("2026-11-15"),
      time: "11:00",
      venue: "Sports Complex A",
      type: "Group",
    },
  });

  // Create community contacts (using createMany with skipDuplicates)
  await prisma.communityContact.createMany({
    data: [
      {
        id: "cc1",
        communityId: "1",
        name: "Ahmed Hassan",
        phone: "+254 712 111 111",
        email: "nairobi.central@fof.co.ke",
      },
      {
        id: "cc2",
        communityId: "1",
        name: "Fatima Ali",
        phone: "+254 712 111 112",
        email: "fatima.ali@fof.co.ke",
      },
      {
        id: "cc3",
        communityId: "2",
        name: "Jennifer Muthoni",
        phone: "+254 723 222 222",
        email: "westlands@fof.co.ke",
      },
    ],
    skipDuplicates: true,
  });

  // Create convenors
  const convenor1 = await prisma.convenor.upsert({
    where: { id: "conv1" },
    update: {},
    create: {
      id: "conv1",
      name: "John Kamau",
      phone: "+254 712 345 678",
      email: "j.kamau@fof.co.ke",
      sportId: "1",
    },
  });

  // Update sport to link convenor
  await prisma.sport.update({
    where: { id: "1" },
    data: { convenorId: convenor1.id },
  });

  const convenor2 = await prisma.convenor.upsert({
    where: { id: "conv2" },
    update: {},
    create: {
      id: "conv2",
      name: "Sarah Wanjiku",
      phone: "+254 723 456 789",
      email: "s.wanjiku@fof.co.ke",
      sportId: "2",
    },
  });

  await prisma.sport.update({
    where: { id: "2" },
    data: { convenorId: convenor2.id },
  });

  const convenor3 = await prisma.convenor.upsert({
    where: { id: "conv3" },
    update: {},
    create: {
      id: "conv3",
      name: "Grace Akinyi",
      phone: "+254 745 678 901",
      email: "g.akinyi@fof.co.ke",
      sportId: "4",
    },
  });

  await prisma.sport.update({
    where: { id: "4" },
    data: { convenorId: convenor3.id },
  });

  const convenor4 = await prisma.convenor.upsert({
    where: { id: "conv4" },
    update: {},
    create: {
      id: "conv4",
      name: "James Otieno",
      phone: "+254 778 901 234",
      email: "j.otieno@fof.co.ke",
      sportId: "10",
    },
  });

  await prisma.sport.update({
    where: { id: "10" },
    data: { convenorId: convenor4.id },
  });

  // Create tournament formats
  await prisma.tournamentFormat.upsert({
    where: { category: "team_sports" },
    update: {},
    create: {
      category: "team_sports",
      title: "Team Sports",
      content: `Football, Basketball, Volleyball, and Cricket will follow a round-robin group stage followed by knockout semifinals and finals.

The group stage will determine seeding for the knockout rounds. Top teams from each group advance to the semifinals.`,
    },
  });

  await prisma.tournamentFormat.upsert({
    where: { category: "individual_sports" },
    update: {},
    create: {
      category: "individual_sports",
      title: "Individual Sports",
      content: `Athletics, Swimming, Table Tennis, and Badminton will have preliminary heats, followed by quarterfinals, semifinals, and finals based on timing/scores.

Participants will be seeded based on preliminary performance. Top performers advance through each round.`,
    },
  });

  await prisma.tournamentFormat.upsert({
    where: { category: "points_system" },
    update: {},
    create: {
      category: "points_system",
      title: "Points System",
      content: `Communities earn points based on rankings:
- Gold Medal: 10 points
- Silver Medal: 7 points
- Bronze Medal: 5 points
- Participation: 3 points per sport

The community with the highest total points wins the overall championship.`,
    },
  });

  // Create settings
  await prisma.settings.upsert({
    where: { id: "1" },
    update: {},
    create: {
      id: "1",
      ageCalculatorDate: new Date("2026-11-01"),
    },
  });

  // Create leaderboard entries
  console.log("Creating leaderboard entries...");

  // Nairobi Central scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm1.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm1.id,
      sportId: sport1.id,
      score: 10,
      position: 1,
      medalType: MedalType.gold,
      notes: "Won the football tournament",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm1.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm1.id,
      sportId: sport2.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in basketball",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm1.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm1.id,
      sportId: sport4.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in athletics",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm1.id,
        sportId: sport10.id, // Badminton
      },
    },
    update: {},
    create: {
      communityId: comm1.id,
      sportId: sport10.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in badminton",
    },
  });

  // Westlands scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm2.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm2.id,
      sportId: sport1.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in football",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm2.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm2.id,
      sportId: sport2.id,
      score: 10,
      position: 1,
      medalType: MedalType.gold,
      notes: "Won the basketball tournament",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm2.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm2.id,
      sportId: sport4.id,
      score: 10,
      position: 1,
      medalType: MedalType.gold,
      notes: "Won the athletics competition",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm2.id,
        sportId: sport11.id, // Darts
      },
    },
    update: {},
    create: {
      communityId: comm2.id,
      sportId: sport11.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in darts",
    },
  });

  // Parklands scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm3.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm3.id,
      sportId: sport1.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in football",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm3.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm3.id,
      sportId: sport2.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in basketball",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm3.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm3.id,
      sportId: sport4.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in athletics",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm3.id,
        sportId: sport10.id, // Badminton
      },
    },
    update: {},
    create: {
      communityId: comm3.id,
      sportId: sport10.id,
      score: 10,
      position: 1,
      medalType: MedalType.gold,
      notes: "Won the badminton tournament",
    },
  });

  // Kilimani scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm4.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm4.id,
      sportId: sport1.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in football",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm4.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm4.id,
      sportId: sport2.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in basketball",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm4.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm4.id,
      sportId: sport4.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in athletics",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm4.id,
        sportId: sport10.id, // Badminton
      },
    },
    update: {},
    create: {
      communityId: comm4.id,
      sportId: sport10.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in badminton",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm4.id,
        sportId: sport11.id, // Darts
      },
    },
    update: {},
    create: {
      communityId: comm4.id,
      sportId: sport11.id,
      score: 10,
      position: 1,
      medalType: MedalType.gold,
      notes: "Won the darts tournament",
    },
  });

  // Lavington scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm5.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm5.id,
      sportId: sport1.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in football",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm5.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm5.id,
      sportId: sport2.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in basketball",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm5.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm5.id,
      sportId: sport4.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in athletics",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm5.id,
        sportId: sport10.id, // Badminton
      },
    },
    update: {},
    create: {
      communityId: comm5.id,
      sportId: sport10.id,
      score: 5,
      position: 3,
      medalType: MedalType.bronze,
      notes: "Third place in badminton",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm5.id,
        sportId: sport11.id, // Darts
      },
    },
    update: {},
    create: {
      communityId: comm5.id,
      sportId: sport11.id,
      score: 7,
      position: 2,
      medalType: MedalType.silver,
      notes: "Second place in darts",
    },
  });

  // Karen scores
  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm6.id,
        sportId: sport1.id, // Football
      },
    },
    update: {},
    create: {
      communityId: comm6.id,
      sportId: sport1.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in football",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm6.id,
        sportId: sport2.id, // Basketball
      },
    },
    update: {},
    create: {
      communityId: comm6.id,
      sportId: sport2.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in basketball",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm6.id,
        sportId: sport4.id, // Athletics
      },
    },
    update: {},
    create: {
      communityId: comm6.id,
      sportId: sport4.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in athletics",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm6.id,
        sportId: sport10.id, // Badminton
      },
    },
    update: {},
    create: {
      communityId: comm6.id,
      sportId: sport10.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in badminton",
    },
  });

  await prisma.leaderboardEntry.upsert({
    where: {
      communityId_sportId: {
        communityId: comm6.id,
        sportId: sport11.id, // Darts
      },
    },
    update: {},
    create: {
      communityId: comm6.id,
      sportId: sport11.id,
      score: 3,
      position: null,
      medalType: MedalType.none,
      notes: "Participated in darts",
    },
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

