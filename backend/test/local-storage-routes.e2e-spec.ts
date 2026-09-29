import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { createHarness, type Harness } from './support/harness';

/**
 * H4 — the local-disk upload/download routes were unauthenticated AND
 * registered in production (anyone could write files to the API host). They
 * now live in a dev-only controller that production never registers.
 */
jest.setTimeout(120_000);

const UPLOADS = path.resolve(process.cwd(), 'uploads');
const PROBE_DIR = `h4-probe-${Date.now().toString(36)}`;

import * as nestCommon from '@nestjs/common';
import * as nestConfig from '@nestjs/config';

type StorageModuleType = typeof import('../src/common/storage/storage.module');

/** Loads StorageModule fresh with a given NODE_ENV, as a new process would.
 *  The Nest packages are pinned to the already-loaded copies: a second copy
 *  would make Nest fail to recognise HttpException subclasses (-> 500) and
 *  give ConfigService a different injection token. */
function loadStorageModule(nodeEnv: string): StorageModuleType {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    let mod!: StorageModuleType;
    jest.isolateModules(() => {
      jest.doMock('@nestjs/common', () => nestCommon);
      jest.doMock('@nestjs/config', () => nestConfig);

      mod = // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/common/storage/storage.module') as StorageModuleType;
    });
    return mod;
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

async function bootStorageApp(
  mod: StorageModuleType,
  storageConfig: Record<string, unknown>,
  nodeEnv: string,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({ storage: storageConfig, app: { nodeEnv, port: 3001 } }),
        ],
      }),
      mod.StorageModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  // Same binary parser main.ts registers outside production.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'image/png',
      { parseAs: 'buffer' },
      (_r, body, done) => done(null, body),
    );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

afterAll(async () => {
  await fs.rm(path.join(UPLOADS, PROBE_DIR), { recursive: true, force: true });
});

describe('local storage routes — development with the local provider', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await bootStorageApp(
      loadStorageModule('development'),
      {},
      'development',
    );
  });
  afterAll(async () => {
    await app.close();
  });

  const key = encodeURIComponent(`${PROBE_DIR}/x.png`);

  it('still works where intended: upload then download round-trips the bytes', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/dev-storage/upload/${key}`,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from('h4-dev-roundtrip'),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ stored: true });

    const get = await app.inject({
      method: 'GET',
      url: `/dev-storage/download/${key}`,
    });
    expect(get.statusCode).toBe(200);
    expect(get.body).toBe('h4-dev-roundtrip');
  });

  it('a missing object is a 404, not a 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/dev-storage/download/${encodeURIComponent(`${PROBE_DIR}/nope.png`)}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['dot-dot prefix', '..%2F..%2Fpwn.png'],
    ['nested traversal', `${PROBE_DIR}%2F..%2F..%2Fpwn.png`],
    ['absolute path', '%2Fetc%2Fpasswd'],
    ['windows absolute', 'C%3A%5CWindows%5Cwin.ini'],
    ['dotenv', '..%2F.env'],
  ])('traversal is rejected on upload AND download (%s)', async (_n, k) => {
    const put = await app.inject({
      method: 'PUT',
      url: `/dev-storage/upload/${k}`,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from('x'),
    });
    const get = await app.inject({
      method: 'GET',
      url: `/dev-storage/download/${k}`,
    });
    expect([400, 404]).toContain(put.statusCode);
    expect([400, 404]).toContain(get.statusCode);
    expect(put.statusCode).not.toBe(200);
    expect(get.statusCode).not.toBe(200);
  });

  it('an upload without a binary body is refused', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/dev-storage/upload/${key}`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('local storage routes — production', () => {
  it('the controller is not registered at all (module definition)', () => {
    const prod = loadStorageModule('production');
    const dev = loadStorageModule('development');
    const controllersOf = (m: StorageModuleType) =>
      (Reflect.getMetadata('controllers', m.StorageModule) as unknown[]) ?? [];
    expect(controllersOf(prod)).toHaveLength(0);
    expect(controllersOf(dev)).toHaveLength(1);
  });

  it('a production process exposes no such routes: 404 for PUT and GET', async () => {
    const supabase = {
      projectRef: 'ref',
      bucket: 'b',
      region: 'ap-northeast-2',
      accessKeyId: 'k',
      secretAccessKey: 's',
    };
    const app = await bootStorageApp(
      loadStorageModule('production'),
      supabase,
      'production',
    );
    try {
      const put = await app.inject({
        method: 'PUT',
        url: `/dev-storage/upload/${encodeURIComponent(`${PROBE_DIR}/prod.png`)}`,
        headers: { 'content-type': 'image/png' },
        payload: Buffer.from('should-never-be-written'),
      });
      const get = await app.inject({
        method: 'GET',
        url: `/dev-storage/download/${encodeURIComponent(`${PROBE_DIR}/prod.png`)}`,
      });
      expect(put.statusCode).toBe(404);
      expect(get.statusCode).toBe(404);
      await expect(
        fs.stat(path.join(UPLOADS, PROBE_DIR, 'prod.png')),
      ).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
});

describe('runtime guard — real storage configured', () => {
  it('even in a non-production process the routes are inert when Supabase is the active provider', async () => {
    const supabase = {
      projectRef: 'ref',
      bucket: 'b',
      region: 'ap-northeast-2',
      accessKeyId: 'k',
      secretAccessKey: 's',
    };
    // dev module (controller registered) + Supabase config => provider is NOT local
    const app = await bootStorageApp(
      loadStorageModule('development'),
      supabase,
      'development',
    );
    try {
      const put = await app.inject({
        method: 'PUT',
        url: `/dev-storage/upload/${encodeURIComponent(`${PROBE_DIR}/sb.png`)}`,
        headers: { 'content-type': 'image/png' },
        payload: Buffer.from('nope'),
      });
      expect(put.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('the real app no longer exposes the legacy public routes', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness('h4legacy');
  });
  afterAll(async () => {
    await h.close();
  });

  it('PUT/GET /materials/local-* are gone (404, unauthenticated or not)', async () => {
    const put = await h.api('PUT', '/materials/local-upload/x.png');
    const get = await h.api('GET', '/materials/local-download/x.png');
    expect(put.status).toBe(404);
    expect(get.status).toBe(404);
  });

  it('the dev-storage routes are inert in the real app when Supabase storage is configured', async () => {
    const get = await h.api('GET', '/dev-storage/download/x.png');
    expect([404]).toContain(get.status);
  });
});
