import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = status.toString();
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        if (Array.isArray((responseBody as any).message)) {
          message = (responseBody as any).message.join(', ');
        } else if ((responseBody as any).message) {
          message = (responseBody as any).message;
        } else {
          message = exception.message;
        }

        if ((responseBody as any).error) {
          code = String((responseBody as any).error);
        }
      }
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}
