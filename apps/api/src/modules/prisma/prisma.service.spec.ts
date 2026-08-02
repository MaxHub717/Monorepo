import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let prismaService: PrismaService;

  beforeEach(() => {
    prismaService = new PrismaService();
  });

  it('initializes PrismaService without error', () => {
    expect(prismaService).toBeDefined();
  });
});
