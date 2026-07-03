import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.upsert({
    where: { code: 'demo-store' },
    update: {
      name: 'AI-POS Demo Store',
      active: true,
    },
    create: {
      name: 'AI-POS Demo Store',
      code: 'demo-store',
      timezone: 'Asia/Shanghai',
      currency: 'USD',
    },
  });

  const demoStaff = [
    { email: 'owner@aipos.test', name: 'Demo Owner', role: 'OWNER' as const },
    { email: 'manager@aipos.test', name: 'Demo Manager', role: 'MANAGER' as const },
    { email: 'cashier@aipos.test', name: 'Demo Cashier', role: 'CASHIER' as const },
  ];

  for (const staff of demoStaff) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        name: staff.name,
        active: true,
      },
      create: {
        email: staff.email,
        name: staff.name,
        passwordHash: hashPassword('password123'),
      },
    });

    await prisma.storeUser.upsert({
      where: { storeId_userId: { storeId: store.id, userId: user.id } },
      update: {
        role: staff.role,
        active: true,
      },
      create: {
        storeId: store.id,
        userId: user.id,
        role: staff.role,
      },
    });
  }

  const orphanProductIds = await prisma.product.findMany({
    where: { storeId: null },
    select: { id: true },
  });
  if (orphanProductIds.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: orphanProductIds.map((product) => product.id) } },
      data: { storeId: store.id },
    });
  }
  await prisma.order.updateMany({
    where: { storeId: null },
    data: { storeId: store.id },
  });
  await prisma.aiDraft.updateMany({
    where: { storeId: null },
    data: { storeId: store.id },
  });

  const count = await prisma.product.count({ where: { storeId: store.id } });
  if (count === 0) {
    await prisma.product.createMany({
      data: [
        { storeId: store.id, name: 'Espresso', category: 'Coffee', price: 3.5 },
        { storeId: store.id, name: 'Latte', category: 'Coffee', price: 5 },
        { storeId: store.id, name: 'Cold Brew', category: 'Coffee', price: 5.5 },
        { storeId: store.id, name: 'Croissant', category: 'Bakery', price: 4.25 },
      ],
    });
  }

  const milkTea =
    (await prisma.product.findFirst({ where: { storeId: store.id, name: 'Milk Tea' } })) ??
    (await prisma.product.create({
      data: {
        storeId: store.id,
        name: 'Milk Tea',
        category: 'Tea',
        price: 6.5,
      },
    }));

  const existingGroups = await prisma.productModifierGroup.findMany({
    where: { productId: milkTea.id },
    select: { id: true },
  });
  const existingGroupIds = existingGroups.map((group) => group.id);
  if (existingGroupIds.length > 0) {
    await prisma.productModifierOption.deleteMany({ where: { groupId: { in: existingGroupIds } } });
    await prisma.productModifierGroup.deleteMany({ where: { id: { in: existingGroupIds } } });
  }

  await prisma.product.update({
    where: { id: milkTea.id },
    data: {
      isActive: true,
      modifierGroups: {
        create: [
          {
            name: 'Ice Level',
            required: true,
            multiSelect: false,
            displayOrder: 1,
            options: {
              create: [
                { name: 'No Ice', priceDelta: 0, displayOrder: 1 },
                { name: 'Normal Ice', priceDelta: 0, displayOrder: 2 },
                { name: 'Hot', priceDelta: 0, displayOrder: 3 },
              ],
            },
          },
          {
            name: 'Sweetness',
            required: true,
            multiSelect: false,
            displayOrder: 2,
            options: {
              create: [
                { name: '0%', priceDelta: 0, displayOrder: 1 },
                { name: '70%', priceDelta: 2, displayOrder: 2 },
                { name: '100%', priceDelta: 0, displayOrder: 3 },
              ],
            },
          },
          {
            name: 'Toppings',
            required: false,
            multiSelect: true,
            displayOrder: 3,
            options: {
              create: [
                { name: 'Pearl', priceDelta: 0, displayOrder: 1 },
                { name: 'Pudding', priceDelta: 3, displayOrder: 2 },
                { name: 'Coconut Jelly', priceDelta: 0, displayOrder: 3 },
              ],
            },
          },
        ],
      },
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
