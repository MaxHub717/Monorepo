import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    logger.info({ method: request.method, url: request.url }, 'request received');
    return next.handle();
  }
}
