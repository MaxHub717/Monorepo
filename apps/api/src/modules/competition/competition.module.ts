import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { CompetitionController } from './competition.controller.js';
import { CompetitionRulesetController } from './competition-ruleset.controller.js';
import { CompetitionService } from './competition.service.js';

@Module({
	imports: [PrismaModule, AuditModule, AuthzModule],
	controllers: [CompetitionController, CompetitionRulesetController],
	providers: [CompetitionService],
})
export class CompetitionModule {}
