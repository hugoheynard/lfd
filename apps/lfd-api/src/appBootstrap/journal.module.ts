import { Global, Injectable, Module } from "@nestjs/common";

import { GrowthModule } from "../b2b/growth/growth.module.js";
import { ActivityRecorder } from "../b2b/growth/domain/ports/activity-recorder.js";
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
   * Aucune clé d'idempotence n'est fournie : le recorder la dérive du `traceId`
   * qu'il écrit lui-même. Elle se calculait ici, et c'était un doublon avec un
   * repli différent hors requête — une constante d'un côté, une trace neuve de
   * l'autre. Deux faits distincts d'un script partageaient alors une clé, et le
   * second disparaissait sans erreur.
   *
   * BLOQUANT (`recordOrFail`) : l'appelant a choisi `publishTraced` ou le
   * laissez-passer du référentiel, donc il a choisi que sa trace conditionne
   * l'écriture.
   */
  async append(fact: JournalFact): Promise<void> {
    await this.recorder.recordOrFail({
      type: fact.type,
      subjectType: fact.subjectType,
      subjectId: fact.subjectId,
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
