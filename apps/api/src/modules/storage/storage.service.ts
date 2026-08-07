import { BadRequestException } from '@nestjs/common';
import { ALLOWED_STORAGE_MIME_TYPES, MAX_STORAGE_SIZE_BYTES } from './storage.constants.js';

export interface StorageService {
  generateSignedUploadUrl(key: string, mimeType: string): Promise<{ uploadUrl: string; objectKey: string }>;
  getObjectUrl(key: string): Promise<string>;
  validateUpload(input: { mimeType: string; sizeBytes: number }): void;
}

export function validateUpload(input: { mimeType: string; sizeBytes: number }) {
  if (!ALLOWED_STORAGE_MIME_TYPES.includes(input.mimeType)) {
    throw new BadRequestException(`Unsupported file type: ${input.mimeType}`);
  }

  if (input.sizeBytes > MAX_STORAGE_SIZE_BYTES) {
    throw new BadRequestException(`File size exceeds ${MAX_STORAGE_SIZE_BYTES} bytes`);
  }
}

export const STORAGE_SERVICE_TOKEN = 'STORAGE_SERVICE';
