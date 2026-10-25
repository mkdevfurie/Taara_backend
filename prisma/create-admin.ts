/**
 * Crée (ou met à jour) un compte ADMIN — à utiliser en production à la place du seed de démo.
 *
 *   ADMIN_EMAIL=moi@exemple.com ADMIN_PHONE=+22890000000 npm run admin:create
 *
 * Sans ADMIN_PASSWORD, un mot de passe aléatoire est généré et affiché UNE seule fois.
 */
import { PrismaClient, UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const phone = process.env.ADMIN_PHONE?.replace(/\s/g, '');
  if (!email || !phone) {
    throw new Error('ADMIN_EMAIL et ADMIN_PHONE sont requis');
  }
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(18).toString('base64url');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD : 12 caractères minimum');

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hash, userType: UserType.ADMIN, isVerified: true, isBanned: false },
    create: {
      email,
      phone,
      password: hash,
      firstName: process.env.ADMIN_FIRST_NAME ?? 'Admin',
      lastName: process.env.ADMIN_LAST_NAME ?? 'TAARA',
      isVerified: true,
      userType: UserType.ADMIN,
      wallet: { create: {} },
    },
  });
  // Toute session existante de ce compte est révoquée
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`Compte admin prêt : ${user.email}`);
  if (generated) {
    console.log(`Mot de passe (affiché une seule fois, à conserver) : ${password}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
