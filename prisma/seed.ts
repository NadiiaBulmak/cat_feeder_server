import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Починаємо очищення бази (щоб уникнути дублікатів)...');

  await prisma.accessLog.deleteMany();
  await prisma.feederStateHistory.deleteMany();
  await prisma.rfidTag.deleteMany();
  await prisma.catFace.deleteMany();
  await prisma.cat.deleteMany();
  await prisma.feeder.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.camera.deleteMany();
  console.log('🐈 Додаємо котів...');

  await prisma.cat.create({
    data: {
      name: 'Seroshtan',
      tags: {
        create: [{ tagValue: '3B00C88C80' }, { tagValue: '3B00C8121F' }],
      },
    },
  });

  await prisma.cat.create({
    data: {
      name: 'Oscar',
    },
  });

  await prisma.cat.create({
    data: {
      name: 'MaoMao',
    },
  });

  console.log('🤖 Додаємо тестову кормушку (Feeder)...');

  await prisma.feeder.create({
    data: {
      name: 'Seroshtan Feeder',
      deviceId: 'esp8266-feeder-01',
    },
  });

  console.log('📷 Додаємо тестову камеру...');

  await prisma.camera.create({
    data: {
      name: 'Seroshtan Camera',
      ipAddress: '192.168.1.100',
    },
  });

  console.log('✅ База успішно наповнена тестовими даними!');
}

main()
  .catch((e) => {
    console.error('❌ Помилка під час виконання seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
