import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('redis.url')),
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule {}
