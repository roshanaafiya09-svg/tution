import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import {
  configureHttpApp,
  createFastifyAdapter,
} from '../src/common/http/app-setup';

/**
 * Boot smoke test. This used to be the Nest CLI scaffold (an Express app
 * hitting `GET /` for "Hello World!") — this project runs on Fastify with
 * no root route, so the scaffold couldn't even construct an app: Nest's
 * missing-@nestjs/platform-express path calls process.exit(1), which
 * silently aborted every e2e suite scheduled after it. It now boots the
 * exact adapter + pipeline main.ts uses and checks the health endpoint.
 */
describe('App boot (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
    );
    configureHttpApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports database and redis up', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      database: 'up',
      redis: 'up',
    });
  });
});
