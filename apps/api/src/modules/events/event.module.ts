import { Global, Module } from '@nestjs/common';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { OutboxService } from './outbox.service.js';

@Global()
@Module({
  providers: [OutboxDispatcher, OutboxService],
  exports: [OutboxService],
})
export class EventModule {}
