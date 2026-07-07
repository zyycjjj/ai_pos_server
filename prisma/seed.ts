import { AiDraftStatus, CampaignStatus, CashMovementReferenceType, CashMovementType, OrderStatus, PaymentMethod, PrismaClient, ShiftStatus } from '@prisma/client';

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

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@aipos.test' } });
  const cashier = await prisma.user.findUniqueOrThrow({ where: { email: 'cashier@aipos.test' } });

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

  const categoryNames = ['Coffee', 'Tea', 'Food', 'Desserts', 'Bakery'];
  const categories = [];
  for (const [index, name] of categoryNames.entries()) {
    categories.push(
      await prisma.category.upsert({
        where: { storeId_name: { storeId: store.id, name } },
        update: { status: 'ACTIVE', sortOrder: index + 1 },
        create: { storeId: store.id, name, status: 'ACTIVE', sortOrder: index + 1 },
      }),
    );
  }
  const categoryByName = new Map(categories.map((category) => [category.name, category]));

  const count = await prisma.product.count({ where: { storeId: store.id } });
  if (count === 0) {
    await prisma.product.createMany({
      data: [
        { storeId: store.id, name: 'Americano', description: 'Clean black coffee for quick service.', categoryId: categoryByName.get('Coffee')?.id, category: 'Coffee', price: 3.5 },
        { storeId: store.id, name: 'Iced Latte', description: 'Espresso with chilled milk.', categoryId: categoryByName.get('Coffee')?.id, category: 'Coffee', price: 5.9 },
        { storeId: store.id, name: 'Classic Milk Tea', description: 'Black tea with fresh milk.', categoryId: categoryByName.get('Tea')?.id, category: 'Tea', price: 5.75 },
        { storeId: store.id, name: 'Lemon Tea', description: 'Bright iced tea with lemon.', categoryId: categoryByName.get('Tea')?.id, category: 'Tea', price: 4.75, availabilityStatus: 'SOLD_OUT' },
        { storeId: store.id, name: 'Chicken Rice', description: 'Fast lunch bowl.', categoryId: categoryByName.get('Food')?.id, category: 'Food', price: 9.5 },
        { storeId: store.id, name: 'Cheesecake', description: 'Slice dessert.', categoryId: categoryByName.get('Desserts')?.id, category: 'Desserts', price: 6.25, isActive: false },
      ],
    });
  }

  const milkTea =
    (await prisma.product.findFirst({ where: { storeId: store.id, name: 'Classic Milk Tea' } })) ??
    (await prisma.product.create({
      data: {
        storeId: store.id,
        name: 'Classic Milk Tea',
        description: 'Black tea with fresh milk.',
        categoryId: categoryByName.get('Tea')?.id,
        category: 'Tea',
        price: 5.75,
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
      availabilityStatus: 'AVAILABLE',
      modifierGroups: {
        create: [
          {
            name: 'Size',
            required: true,
            multiSelect: false,
            minSelect: 1,
            maxSelect: 1,
            status: 'ACTIVE',
            displayOrder: 0,
            options: {
              create: [
                { name: 'Regular', priceDelta: 0, status: 'ACTIVE', displayOrder: 1 },
                { name: 'Large', priceDelta: 1, status: 'ACTIVE', displayOrder: 2 },
              ],
            },
          },
          {
            name: 'Ice Level',
            required: true,
            multiSelect: false,
            minSelect: 1,
            maxSelect: 1,
            status: 'ACTIVE',
            displayOrder: 1,
            options: {
              create: [
                { name: 'No Ice', priceDelta: 0, status: 'ACTIVE', displayOrder: 1 },
                { name: 'Less Ice', priceDelta: 0, status: 'ACTIVE', displayOrder: 2 },
                { name: 'Normal Ice', priceDelta: 0, status: 'ACTIVE', displayOrder: 3 },
              ],
            },
          },
          {
            name: 'Sweetness',
            required: true,
            multiSelect: false,
            minSelect: 1,
            maxSelect: 1,
            status: 'ACTIVE',
            displayOrder: 2,
            options: {
              create: [
                { name: '0%', priceDelta: 0, status: 'ACTIVE', displayOrder: 1 },
                { name: '70%', priceDelta: 0, status: 'ACTIVE', displayOrder: 2 },
                { name: '100%', priceDelta: 0, status: 'ACTIVE', displayOrder: 3 },
              ],
            },
          },
          {
            name: 'Toppings',
            required: false,
            multiSelect: true,
            minSelect: 0,
            maxSelect: 3,
            status: 'ACTIVE',
            displayOrder: 3,
            options: {
              create: [
                { name: 'Pearl', priceDelta: 0.75, status: 'ACTIVE', displayOrder: 1 },
                { name: 'Coconut Jelly', priceDelta: 0.75, status: 'SOLD_OUT', displayOrder: 2 },
                { name: 'Cheese Foam', priceDelta: 1.5, status: 'ACTIVE', displayOrder: 3 },
              ],
            },
          },
        ],
      },
    },
  });

  const products = await prisma.product.findMany({
    where: { storeId: store.id, isActive: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  const orderCount = await prisma.order.count({ where: { storeId: store.id } });
  if (orderCount < 2 && products.length >= 2) {
    const now = new Date();
    const demoOrders = [
      {
        orderNumber: `DEMO-${store.id.slice(-6)}-001`,
        pickupNumber: '0001',
        product: products[0],
        quantity: 2,
        unitPrice: Number(products[0].price),
        tax: 0.56,
      },
      {
        orderNumber: `DEMO-${store.id.slice(-6)}-002`,
        pickupNumber: '0002',
        product: products[1],
        quantity: 1,
        unitPrice: Number(products[1].price),
        tax: 0.4,
      },
    ];

    for (const demoOrder of demoOrders) {
      const lineTotal = Number((demoOrder.unitPrice * demoOrder.quantity).toFixed(2));
      const total = Number((lineTotal + demoOrder.tax).toFixed(2));
      await prisma.order.upsert({
        where: { orderNumber: demoOrder.orderNumber },
        update: {},
        create: {
          storeId: store.id,
          orderNumber: demoOrder.orderNumber,
          pickupNumber: demoOrder.pickupNumber,
          status: OrderStatus.PAID,
          paymentMethod: PaymentMethod.CARD,
          currency: 'USD',
          subtotal: lineTotal,
          tax: demoOrder.tax,
          tip: 0,
          total,
          paidAt: now,
          items: {
            create: {
              productId: demoOrder.product.id,
              productNameSnapshot: demoOrder.product.name,
              productCategorySnapshot: demoOrder.product.category,
              quantity: demoOrder.quantity,
              unitPrice: demoOrder.unitPrice,
              lineTotal,
            },
          },
          payments: {
            create: {
              method: PaymentMethod.CARD,
              amount: total,
            },
          },
        },
      });
    }
  }

  const shiftCount = await prisma.shift.count({ where: { storeId: store.id } });
  if (shiftCount === 0) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    await prisma.shift.create({
      data: {
        storeId: store.id,
        userId: cashier.id,
        status: ShiftStatus.OPEN,
        openingCash: 200,
        expectedCash: 335,
        openedByUserId: cashier.id,
        notes: 'Seed open shift',
        movements: {
          create: [
            { storeId: store.id, type: CashMovementType.OPENING, amount: 200, reason: 'Opening cash', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id },
            { storeId: store.id, type: CashMovementType.SALE, amount: 120, reason: 'Cash sales', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id },
            { storeId: store.id, type: CashMovementType.CASH_IN, amount: 30, reason: 'Change float refill', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id },
            { storeId: store.id, type: CashMovementType.REFUND, amount: 15, reason: 'Cash refund', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id },
          ],
        },
      },
    });

    await prisma.shift.create({
      data: {
        storeId: store.id,
        userId: cashier.id,
        status: ShiftStatus.CLOSED,
        openedAt: threeDaysAgo,
        closedAt: new Date(threeDaysAgo.getTime() + 8 * 60 * 60 * 1000),
        openingCash: 200,
        expectedCash: 500,
        actualCash: 500,
        variance: 0,
        openedByUserId: cashier.id,
        closedByUserId: cashier.id,
        notes: 'Balanced seed shift',
        movements: {
          create: [
            { storeId: store.id, type: CashMovementType.OPENING, amount: 200, reason: 'Opening cash', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id, createdAt: threeDaysAgo },
            { storeId: store.id, type: CashMovementType.SALE, amount: 350, reason: 'Cash sales', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id, createdAt: threeDaysAgo },
            { storeId: store.id, type: CashMovementType.CASH_OUT, amount: 50, reason: 'Cash drop', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: threeDaysAgo },
          ],
        },
      },
    });

    await prisma.shift.create({
      data: {
        storeId: store.id,
        userId: cashier.id,
        status: ShiftStatus.CLOSED,
        openedAt: twoDaysAgo,
        closedAt: new Date(twoDaysAgo.getTime() + 8 * 60 * 60 * 1000),
        openingCash: 200,
        expectedCash: 620,
        actualCash: 615,
        variance: -5,
        openedByUserId: cashier.id,
        closedByUserId: owner.id,
        notes: 'Short seed shift',
        movements: {
          create: [
            { storeId: store.id, type: CashMovementType.OPENING, amount: 200, reason: 'Opening cash', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id, createdAt: twoDaysAgo },
            { storeId: store.id, type: CashMovementType.SALE, amount: 500, reason: 'Cash sales', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: cashier.id, createdAt: twoDaysAgo },
            { storeId: store.id, type: CashMovementType.REFUND, amount: 30, reason: 'Cash refund', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: twoDaysAgo },
            { storeId: store.id, type: CashMovementType.CASH_IN, amount: 50, reason: 'Change float refill', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: twoDaysAgo },
            { storeId: store.id, type: CashMovementType.CASH_OUT, amount: 100, reason: 'Cash drop', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: twoDaysAgo },
          ],
        },
      },
    });

    await prisma.shift.create({
      data: {
        storeId: store.id,
        userId: owner.id,
        status: ShiftStatus.CLOSED,
        openedAt: yesterday,
        closedAt: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000),
        openingCash: 150,
        expectedCash: 400,
        actualCash: 405,
        variance: 5,
        openedByUserId: owner.id,
        closedByUserId: owner.id,
        notes: 'Over seed shift',
        movements: {
          create: [
            { storeId: store.id, type: CashMovementType.OPENING, amount: 150, reason: 'Opening cash', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: yesterday },
            { storeId: store.id, type: CashMovementType.SALE, amount: 250, reason: 'Cash sales', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: yesterday },
            { storeId: store.id, type: CashMovementType.ADJUSTMENT, amount: 0, reason: 'No adjustment needed', referenceType: CashMovementReferenceType.MANUAL, createdByUserId: owner.id, createdAt: yesterday },
          ],
        },
      },
    });
  }

  const campaignCount = await prisma.campaign.count({ where: { storeId: store.id } });
  if (campaignCount === 0) {
    await prisma.campaign.create({
      data: {
        storeId: store.id,
        name: 'Afternoon Chill Promo',
        goal: 'Increase afternoon sales',
        status: CampaignStatus.DRAFT,
        discountType: 'percentage',
        discountValue: 15,
        timeWindow: '2pm-5pm',
        bannerCopy: 'Make the slow hours feel easy with a fresh counter deal.',
        staffMessage: 'Recommend Cold Brew during the afternoon window.',
        structuredJson: {
          campaignName: 'Afternoon Chill Promo',
          goal: 'Increase afternoon sales',
          targetProducts: ['Cold Brew'],
          discountType: 'percentage',
          discountValue: 15,
          timeWindow: '2pm-5pm',
        },
      },
    });
  }

  const menuDraftCount = await prisma.aiDraft.count({
    where: {
      storeId: store.id,
      prompt: 'Seed menu draft for Admin shell',
    },
  });
  if (menuDraftCount === 0) {
    await prisma.aiDraft.create({
      data: {
        storeId: store.id,
        prompt: 'Seed menu draft for Admin shell',
        status: AiDraftStatus.DRAFT,
        structuredJson: {
          currency: 'USD',
          source: 'seed-admin-menu-draft',
          items: [
            { name: 'Iced Latte', category: 'Coffee', price: 5.75, currency: 'USD' },
            { name: 'Matcha Lemonade', category: 'Tea', price: 5.25, currency: 'USD' },
          ],
        },
      },
    });
  }

  const campaignDraftCount = await prisma.aiDraft.count({
    where: {
      storeId: store.id,
      prompt: 'Seed campaign draft for Admin shell',
    },
  });
  if (campaignDraftCount === 0) {
    await prisma.aiDraft.create({
      data: {
        storeId: store.id,
        prompt: 'Seed campaign draft for Admin shell',
        status: AiDraftStatus.DRAFT,
        structuredJson: {
          draftType: 'campaign',
          campaign: {
            campaignName: 'Weekend Lunch Boost',
            goal: 'Increase lunch orders',
            targetProducts: ['Croissant', 'Latte'],
            discountType: 'staff_prompt',
            discountValue: 0,
            timeWindow: 'Weekend lunch',
          },
        },
      },
    });
  }
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
