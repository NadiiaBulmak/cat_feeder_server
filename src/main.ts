import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: [process.env.LOCAL_FRONTEND, process.env.VERCEL_FRONTEND],
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
