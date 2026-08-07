import { Injectable } from '@nestjs/common';
import { StorageService, validateUpload } from './storage.service.js';

@Injectable()
export class LocalStorageService implements StorageService {
  async generateSignedUploadUrl(key: string, mimeType: string) {
    const uploadUrl = `http://localhost:3000/api/v1/storage/upload?key=${encodeURIComponent(key)}&mimeType=${encodeURIComponent(mimeType)}`;
    return { uploadUrl, objectKey: key };
  }

  async getObjectUrl(key: string) {
    return `http://localhost:3000/api/v1/storage/${encodeURIComponent(key)}`;
  }

  validateUpload(input: { mimeType: string; sizeBytes: number }) {
    validateUpload(input);
  }
}
