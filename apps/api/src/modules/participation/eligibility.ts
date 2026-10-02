import { Prisma } from '@prisma/client';

const INELIGIBLE_PLAYER_STATUSES = ['SUSPENDED', 'BANNED', 'ARCHIVED', 'RETIRED'] as const;

export const eligiblePlayerProfileWhere: Prisma.PlayerProfileWhereInput = {
  verification_status: 'VERIFIED',
  player_status: { notIn: [...INELIGIBLE_PLAYER_STATUSES] },
};

export function isEligiblePlayerProfile(player: {
  verification_status: string;
  player_status: string;
}) {
  return player.verification_status === 'VERIFIED' &&
    !INELIGIBLE_PLAYER_STATUSES.includes(player.player_status as (typeof INELIGIBLE_PLAYER_STATUSES)[number]);
}