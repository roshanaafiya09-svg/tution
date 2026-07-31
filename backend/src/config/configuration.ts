import { registerAs } from '@nestjs/config';
import { EnvConfig } from './env.validation';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
  port: Number(process.env.PORT ?? 3001),
  // :3000 is the Next.js tutor dashboard, :5000 is `flutter run -d
  // web-server` for previewing the mobile app without an Android SDK.
  corsOrigins: (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5000'
  )
    .split(',')
    .map((origin) => origin.trim()),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL as string,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL as string,
}));

export const whatsappConfig = registerAs('whatsapp', () => ({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? 'otp_login',
  templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US',
  apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
}));

export const googleAuthConfig = registerAs('googleAuth', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));

export const storageConfig = registerAs('storage', () => ({
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
}));

export const authConfig = registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTokenTtl: '15m',
}));
