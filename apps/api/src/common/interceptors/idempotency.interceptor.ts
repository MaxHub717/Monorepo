import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service.js';
import { Observable, EMPTY, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { createHash } from 'node:crypto';

interface IdempotencyRecord {
  request_hash: string;
  response_body: unknown;
  response_status: number | null;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method.toUpperCase();

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const key = request.headers['idempotency-key'] as string | undefined;
    if (!key) {
      return next.handle();
    }

    const resource = request.path;
    const requestHash = createHash('sha256')
      .update(method)
      .update(resource)
      .update(JSON.stringify(request.query || {}))
      .update(JSON.stringify(request.body || {}))
      .digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return from(
      this.prisma.idempotencyKey
        .deleteMany({ where: { expires_at: { lt: now } } })
        .then(() => this.prisma.idempotencyKey.findUnique({ where: { key } })),
    ).pipe(
      mergeMap((existing) => {
        const record = existing as IdempotencyRecord | null;

        if (record) {
          if (record.request_hash !== requestHash) {
            throw new ConflictException('Idempotency key conflict with different request payload');
          }

          if (record.response_body !== null && typeof record.response_status === 'number') {
            response.status(record.response_status).json(record.response_body);
            return EMPTY;
          }
        }

        return next.handle().pipe(
          mergeMap(async (result) => {
            const stored = {
              key,
              resource,
              request_hash: requestHash,
              response_body: {
                success: true,
                data: result,
                error: null,
              },
              response_status: response.statusCode || 200,
              expires_at: expiresAt,
            };

            if (record) {
              await this.prisma.idempotencyKey.update({
                where: { key },
                data: stored,
              });
            } else {
              await this.prisma.idempotencyKey.create({ data: stored });
            }

            return result;
          }),
        );
      }),
    );
  }
}
