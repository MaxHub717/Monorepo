import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { CompetitionController, PlayerCompetitionController } from './competition.controller.js';
import { CompetitionRulesetController, SeasonRulesController } from './competition-ruleset.controller.js';
import { PublicCompetitionController } from './public-competition.controller.js';
import { CompetitionService } from './competition.service.js';

@Module({
	imports: [PrismaModule, AuditModule, AuthzModule],
	controllers: [CompetitionController, PlayerCompetitionController, CompetitionRulesetController, SeasonRulesController, PublicCompetitionController],
	providers: [CompetitionService],
	exports: [CompetitionService],
})
export class CompetitionModule {}
