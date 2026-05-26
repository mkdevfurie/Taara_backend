import { PrismaClient, UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database…');

  const adminPassword = await bcrypt.hash('admin12345', 10);
  const proPassword = await bcrypt.hash('pro12345', 10);
  const clientPassword = await bcrypt.hash('client12345', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@taara.app' },
    update: {},
    create: {
      email: 'admin@taara.app',
      phone: '+22890000000',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'Taara',
      isVerified: true,
      userType: UserType.ADMIN,
      wallet: { create: {} },
    },
  });

  const client = await prisma.user.upsert({
    where: { email: 'client@taara.app' },
    update: {},
    create: {
      email: 'client@taara.app',
      phone: '+22891111111',
      password: clientPassword,
      firstName: 'Koffi',
      lastName: 'Mensah',
      isVerified: true,
      userType: UserType.CLIENT,
      wallet: { create: {} },
    },
  });

  const proUser = await prisma.user.upsert({
    where: { email: 'pro@taara.app' },
    update: {},
    create: {
      email: 'pro@taara.app',
      phone: '+22892222222',
      password: proPassword,
      firstName: 'Yawa',
      lastName: 'Agbenya',
      isVerified: true,
      userType: UserType.PRO,
      wallet: { create: {} },
      professional: {
        create: {
          specialties: ['Électricien', 'Mécanicien'],
          certifications: [],
          experience: 7,
          bio: 'Électricien à Lomé depuis 2018, spécialité moteurs et générateurs.',
          serviceZone: ['Lomé', 'Tsévié'],
          isVerified: true,
          hourlyRate: 3500,
          availability: {
            mon: '09:00-18:00',
            tue: '09:00-18:00',
            wed: '09:00-18:00',
            thu: '09:00-18:00',
            fri: '09:00-18:00',
            sat: '10:00-14:00',
          },
        },
      },
    },
  });

  console.log({ admin: admin.email, client: client.email, pro: proUser.email });
  console.log('Seeding done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
