import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { HealthController } from './common/controllers/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthzModule } from './common/authz/authz.module.js';
import { UserModule } from './modules/user/user.module.js';
import { PlayerModule } from './modules/player/player.module.js';
import { ClubModule } from './modules/club/club.module.js';
import { SeasonModule } from './modules/season/season.module.js';
import { MatchModule } from './modules/match/match.module.js';
import { DisputeModule } from './modules/dispute/dispute.module.js';
import { PenaltyModule } from './modules/penalty/penalty.module.js';
import { StandingsModule } from './modules/standings/standings.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { EventModule } from './modules/events/event.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { RedisModule } from './modules/redis/redis.module.js';
import { validate } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
      validate,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>('THROTTLE_TTL', 60),
        limit: configService.get<number>('THROTTLE_LIMIT', 10),
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthzModule,
    StorageModule,
    RedisModule,
    EventModule,
    AuditModule,
    AuthModule,
    UserModule,
    PlayerModule,
    ClubModule,
    SeasonModule,
    MatchModule,
    DisputeModule,
    PenaltyModule,
    StandingsModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
