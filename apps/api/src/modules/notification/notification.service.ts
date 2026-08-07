import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(userId?: string) {
    if (!userId) return [];
    return this.prisma.notification.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } });
  }

  async markAllRead(userId?: string) {
    if (!userId) return { updated: 0 };
    const res = await this.prisma.notification.updateMany({ where: { user_id: userId, read: false }, data: { read: true } });
    return { updated: res.count };
  }

  async createNotification(data: { userId: string; title: string; message: string; category?: string; relatedEntity?: string }, tx?: Prisma.TransactionClient) {
    const client = tx ?? (this.prisma as any);
    return client.notification.create({ data: { user_id: data.userId, title: data.title, message: data.message, category: data.category ?? null, related_entity: data.relatedEntity ?? null } });
  }
}
