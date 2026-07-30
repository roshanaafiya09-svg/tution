import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module';
import { KYSELY_CONNECTION } from './database/database.module';
import type { DB } from './database/types';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(ConfigService);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const db = app.get<Kysely<DB>>(KYSELY_CONNECTION);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void db.destroy().finally(() => process.exit(0));
    });
  }

  const port = config.get<number>('app.port') ?? 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Tuition App API listening on http://localhost:${port}`);
}
bootstrap();
