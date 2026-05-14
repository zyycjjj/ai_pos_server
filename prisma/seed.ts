import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.product.count();
  if (count > 0) {
    return;
  }

  await prisma.product.createMany({
    data: [
      { name: 'Espresso', category: 'Coffee', price: 3.5 },
      { name: 'Latte', category: 'Coffee', price: 5 },
      { name: 'Cold Brew', category: 'Coffee', price: 5.5 },
      { name: 'Croissant', category: 'Bakery', price: 4.25 },
    ],
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
