import { Global, Module } from '@nestjs/common';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { OutboxService } from './outbox.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [OutboxDispatcher, OutboxService],
  exports: [OutboxService],
})
export class EventModule {}
