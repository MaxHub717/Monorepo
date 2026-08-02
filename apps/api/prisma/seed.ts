import { PrismaClient } from '@prisma/client';
import { PermissionName, RoleName } from '../src/common/authz/authz.types.js';
import { ROLE_PERMISSIONS } from '../src/common/authz/authz.constants.js';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  for (const roleName of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name: roleName as any },
      update: {},
      create: { name: roleName as any, description: roleName },
    });
  }

  for (const permissionName of Object.values(PermissionName)) {
    await prisma.permission.upsert({
      where: { name: permissionName as any },
      update: {},
      create: { name: permissionName as any, description: permissionName },
    });
  }

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName as RoleName } });
    if (!role) continue;
    for (const permissionName of permissions) {
      const permission = await prisma.permission.findUnique({ where: { name: permissionName } });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: role.id, permission_id: permission.id } as any },
        update: {},
        create: { role_id: role.id, permission_id: permission.id },
      });
    }
  }

  const existingAdmin = await prisma.user.findFirst({ where: { email: 'hq-admin@nexgen.local' } });
  if (!existingAdmin) {
    const adminPasswordHash = await argon2.hash('Nexgen2026!');
    const user = await prisma.user.create({
      data: {
        email: 'hq-admin@nexgen.local',
        username: 'hqadmin',
        password_hash: adminPasswordHash,
        account_status: 'ACTIVE',
        email_verified_at: new Date(),
      },
    });

    await prisma.playerProfile.create({
      data: {
        user_id: user.id,
        gamer_tag: 'hqadmin',
        verification_status: 'VERIFIED',
        player_status: 'VERIFIED',
      },
    });

    const role = await prisma.role.findUnique({ where: { name: RoleName.HQ_ADMIN } });
    if (role) {
      await prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
