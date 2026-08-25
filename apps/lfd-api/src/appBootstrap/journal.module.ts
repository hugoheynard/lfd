import { Global, Injectable, Module } from "@nestjs/common";

import { GrowthModule } from "../b2b/growth/growth.module.js";
import { ActivityRecorder } from "../b2b/growth/domain/ports/activity-recorder.js";
import { currentRequestContext } from "../platform/context/request-context.store.js";
import { Journal } from "../platform/journal/journal.js";
import type { JournalFact } from "../platform/journal/journal-fact.js";
import { PimJournal, type PimJournalEntry } from "../pim/journal/pim-journal.js";

/**
 * Branche le journal **de la plateforme** sur le journal d'activité réel.
 *
 * Comme `CatalogFeedModule`, et pour la même raison : la matrice des frontières
 * interdit à `pim` (et à qui n'est pas `b2b`) de voir `growth`, et seule la
 * racine de composition a le droit de connaître les deux côtés. `@Global` parce
 * que les émetteurs sont dispersés — handlers du référentiel, handlers des
 * comptes clients — et qu'aucun ne doit dépendre du module qui fournit le
 * binding.
 */
@Injectable()
class ActivityJournal extends Journal {
  constructor(private readonly recorder: ActivityRecorder) {
    super();
  }

  /**
   * La **clé d'idempotence** est bâtie sur le `traceId` et non sur l'horloge :
   * un horodatage donne une clé neuve à chaque rejeu, donc une idempotence qui
   * n'idempote rien. La trace, elle, survit au rejeu d'une même requête, et deux
   * corrections successives d'un même sujet restent bien deux faits — elles
   * arrivent par deux requêtes.
   *
   * BLOQUANT (`recordOrFail`) : l'appelant a choisi `publishTraced` ou le
   * laissez-passer du référentiel, donc il a choisi que sa trace conditionne
   * l'écriture.
   */
  async append(fact: JournalFact): Promise<void> {
    const traceId = currentRequestContext()?.traceId ?? "hors-requete";
    await this.recorder.recordOrFail({
      type: fact.type,
      subjectType: fact.subjectType,
      subjectId: fact.subjectId,
      idempotencyKey: `${fact.type}:${fact.subjectId}:${traceId}`,
      payload: fact.payload,
      ...(fact.occurredAt === undefined ? {} : { occurredAt: fact.occurredAt }),
    });
  }
}

/**
 * Le journal du **référentiel**, par-dessus celui de la plateforme.
 *
 * Il ne reste ici que ce qui lui est propre : la portée (`blast`) rejoint le
 * payload sous une clé à elle, pour rester lisible d'un coup d'œil. Le reste —
 * acteur, trace, idempotence — est déjà tenu un cran plus bas, et l'y laisser
 * en double aurait fini par diverger.
 */
@Injectable()
class PimActivityJournal extends PimJournal {
  constructor(private readonly journal: Journal) {
    super();
  }

  async record(entry: PimJournalEntry): Promise<void> {
    await this.journal.append({
      type: entry.type,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      payload: entry.blast === undefined ? entry.payload : { ...entry.payload, blast: entry.blast },
    });
  }
}

@Global()
@Module({
  imports: [GrowthModule],
  providers: [
    { provide: Journal, useClass: ActivityJournal },
    { provide: PimJournal, useClass: PimActivityJournal },
  ],
  exports: [Journal, PimJournal],
})
export class JournalModule {}
