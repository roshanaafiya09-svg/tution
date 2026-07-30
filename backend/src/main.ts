import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { Kysely } from 'kysely';
import { AppModule } from './app.module';
import { KYSELY_CONNECTION } from './database/database.module';
import type { DB } from './database/types';

async function bootstrap() {
  const adapter = new FastifyAdapter();

  // Raw binary bodies for the dev-only local upload endpoint that stands
  // in for R2's presigned PUT (see LocalStorageProvider). In production
  // uploads go straight to R2 and never reach the API.
  adapter
    .getInstance()
    .addContentTypeParser(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
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

  console.log(`Tuition App API listening on http://localhost:${port}`);
}
void bootstrap();
