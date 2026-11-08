import { Global, Injectable, Module } from "@nestjs/common";

import { MailBacklogSurvey } from "../mail/channels/requests/mail-backlog-survey.js";
import {
  type MailBacklogFigures,
  MailBacklogReadings,
} from "../ops/health/mail-backlog-readings.port.js";

/**
 * L'adaptateur : la veille que le bloc `mail` publie par son canal, rendue
 * dans la forme que la carte de santé déclare. Une copie champ à champ — les
 * deux blocs gardent chacun leur type, aucun n'importe l'autre.
 */
@Injectable()
export class MailChannelBacklogReadings extends MailBacklogReadings {
  constructor(private readonly survey: MailBacklogSurvey) {
    super();
  }

  async read(): Promise<MailBacklogFigures> {
    const summary = await this.survey.read();
    return {
      stalled: summary.stalled,
      oldestStalledMinutes: summary.oldestStalledMinutes,
      definitiveFailures: summary.definitiveFailures,
      stalledAfterMinutes: summary.stalledAfterMinutes,
    };
  }
}

/**
 * **La veille du courrier, reliée à la carte de santé** (plan
 * `documentation/mail/plan-service-e-mails.md`, § 25, point 3).
 *
 * `ops` déclare le port, `mail` publie sa veille par `mail/channels/requests/` ;
 * seule la racine voit les deux. `@Global` : le port est injecté par le module
 * d'`ops`, qui ne peut pas importer celui-ci.
 */
@Global()
@Module({
  providers: [{ provide: MailBacklogReadings, useClass: MailChannelBacklogReadings }],
  exports: [MailBacklogReadings],
})
export class MailBacklogReadingsModule {}
