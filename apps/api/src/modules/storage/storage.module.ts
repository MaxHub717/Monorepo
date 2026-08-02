import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service.js';
import { STORAGE_SERVICE_TOKEN } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE_TOKEN,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('STORAGE_DRIVER', 'local');

        switch (driver) {
          case 'local':
            return new LocalStorageService();
          default:
            throw new Error(`Unsupported storage driver: ${driver}`);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_SERVICE_TOKEN],
})
export class StorageModule {}
