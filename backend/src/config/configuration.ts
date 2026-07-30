import { registerAs } from '@nestjs/config';
import { EnvConfig } from './env.validation';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim()),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL as string,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL as string,
}));

export const authConfig = registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTokenTtl: '15m',
}));
