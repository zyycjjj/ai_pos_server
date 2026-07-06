import { AiDraftStatus, CampaignStatus, OrderStatus, PaymentMethod, PrismaClient } from '@prisma/client';

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
