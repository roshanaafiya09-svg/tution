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
      useFactory: (config: ConfigService) => {
        // ioredis's own string-URL parser mishandles some rediss:// URLs
        // (falls back to treating them as a Unix socket path, raising
        // ENOENT). Parsing with the WHATWG URL API and building explicit
        // options sidesteps that.
        const url = new URL(config.getOrThrow<string>('redis.url'));
        return new Redis({
          host: url.hostname,
          port: Number(url.port),
          username: url.username || undefined,
          password: url.password || undefined,
          tls: url.protocol === 'rediss:' ? {} : undefined,
        });
      },
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule {}
