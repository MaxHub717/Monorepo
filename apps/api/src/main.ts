import 'reflect-metadata';
console.log("===== USING THIS MAIN.TS =====");
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AuthGuard, AccountStatusGuard } from './common/authz/authz.guards.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { PrismaService } from './modules/prisma/prisma.service.js';
import { ThrottlerGuard } from '@nestjs/throttler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.enableVersioning({ type: VersioningType.URI });
  app.use(helmet());
  // const swaggerConfig = new DocumentBuilder().setTitle('NexGen Esport API').setVersion('1.0').build();
  // const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  // SwaggerModule.setup('docs', app, swaggerDocument);
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());
  app.use(RequestIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalGuards // app.get(ThrottlerGuard),
  (app.get(AuthGuard), app.get(AccountStatusGuard));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new IdempotencyInterceptor(app.get(PrismaService)),
    new LoggingInterceptor(),
  );

app.useGlobalInterceptors(
  new ResponseInterceptor(),
  new IdempotencyInterceptor(app.get(PrismaService)),
  new LoggingInterceptor(),
);

console.log("A");

const port = configService.get<number>("PORT", 3000);

console.log("B");

await app.listen(port);

console.log("C");

console.log(`API listening on http://localhost:${port}`);
}

bootstrap();