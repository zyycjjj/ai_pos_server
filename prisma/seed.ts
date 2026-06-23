import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.product.count();
  if (count === 0) {
    await prisma.product.createMany({
      data: [
        { name: 'Espresso', category: 'Coffee', price: 3.5 },
        { name: 'Latte', category: 'Coffee', price: 5 },
        { name: 'Cold Brew', category: 'Coffee', price: 5.5 },
        { name: 'Croissant', category: 'Bakery', price: 4.25 },
      ],
    });
  }

  const milkTea =
    (await prisma.product.findFirst({ where: { name: 'Milk Tea' } })) ??
    (await prisma.product.create({
      data: {
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
