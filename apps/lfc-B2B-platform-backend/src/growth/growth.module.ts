import { Module } from "@nestjs/common";

import { ActivityRecorder } from "./domain/ports/activity-recorder.js";
import { PrismaActivityRecorder } from "./infrastructure/prisma-activity-recorder.js";

/**
 * Module **croissance** (`growth/`) — cross-domain. Pour l'instant il n'expose
 * que le **journal d'événements** (`ActivityRecorder`), exporté pour que les
 * émetteurs des autres contextes le consomment. Il ne dépend d'AUCUNE table ou
 * agrégat voisin : uniquement du contrat d'événements + les fondations (`Clock`,
 * `IdGenerator`, RequestContext), déjà globales.
 */
@Module({
  providers: [{ provide: ActivityRecorder, useClass: PrismaActivityRecorder }],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
