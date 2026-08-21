import { Global, Injectable, Module } from "@nestjs/common";

import { GrowthModule } from "../b2b/growth/growth.module.js";
import { ActivityRecorder } from "../b2b/growth/domain/ports/activity-recorder.js";
import { currentRequestContext } from "../platform/context/request-context.store.js";
import { PimJournal, type PimJournalEntry } from "../pim/journal/pim-journal.js";

/**
 * Branche le journal du référentiel sur le **journal d'activité réel**.
 *
 * Comme `CatalogFeedModule`, et pour la même raison : la matrice des frontières
 * interdit à `pim` de voir `b2b`, et seule la racine de composition a le droit
 * de connaître les deux côtés. `@Global` parce que les émetteurs sont des
 * handlers dispersés dans le référentiel, qui ne peuvent pas importer le module
 * qui fournit le binding sans devenir dépendants de la plateforme.
 */
@Injectable()
class ActivityJournalAdapter extends PimJournal {
  constructor(private readonly recorder: ActivityRecorder) {
    super();
  }

  /**
   * Traduit une entrée du référentiel en événement d'activité.
   *
   * La **clé d'idempotence** est bâtie sur le `traceId` et non sur l'horloge :
   * un horodatage donne une clé neuve à chaque rejeu, donc une idempotence qui
   * n'idempote rien. La trace, elle, survit au rejeu d'une même requête, et deux
   * corrections successives d'un même taux restent bien deux faits — elles
   * arrivent par deux requêtes.
   *
   * La portée rejoint le payload sous une clé à elle, pour rester lisible d'un
   * coup d'œil dans le journal.
   */
  async record(entry: PimJournalEntry): Promise<void> {
    const traceId = currentRequestContext()?.traceId ?? "hors-requete";
    await this.recorder.record({
      type: entry.type,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      idempotencyKey: `${entry.type}:${entry.subjectId}:${traceId}`,
      payload: entry.blast === undefined ? entry.payload : { ...entry.payload, blast: entry.blast },
    });
  }
}

@Global()
@Module({
  imports: [GrowthModule],
  providers: [{ provide: PimJournal, useClass: ActivityJournalAdapter }],
  exports: [PimJournal],
})
export class PimJournalModule {}
