import { Global, Injectable, Module } from "@nestjs/common";

import { GrowthModule } from "../b2b/growth/growth.module.js";
import { ActivityRecorder } from "../b2b/growth/domain/ports/activity-recorder.js";
import { Journal } from "../platform/journal/journal.js";
import type { JournalFact } from "../platform/journal/journal-fact.js";
import {
  PimJournal,
  type PimJournalEntry,
  type PimSubjectType,
} from "../pim/journal/pim-journal.js";
import { PimJournalReader, type PimJournalFact } from "../pim/journal/pim-journal-reader.js";
import { PrismaService } from "../platform/database/prisma.service.js";

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

/**
 * La lecture du journal, côté référentiel.
 *
 * Elle vit ICI, avec l'écriture, plutôt que dans le PIM : `activity_events`
 * appartient au schéma `growth`, et un adaptateur du référentiel qui irait la
 * lire directement franchirait une frontière que le port existe justement pour
 * garder. Le PIM dépend de l'abstraction ; la racine de composition sait, elle,
 * où la table se trouve.
 */
@Injectable()
class PimActivityJournalReader extends PimJournalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async factsAbout(
    subjectType: PimSubjectType,
    subjectId: string,
    since: Date,
    until: Date,
  ): Promise<readonly PimJournalFact[]> {
    const rows = await this.prisma.activityEvent.findMany({
      // `since` EXCLUSIF : un fait daté de l'ancre de départ appartient à ce
      // qu'elle a figé, pas à ce qui s'est passé depuis.
      where: { subjectType, subjectId, occurredAt: { gt: since, lte: until } },
      // Du plus RÉCENT au plus ancien : « qui a fait ça » veut dire « qui l'a
      // fait en dernier », et c'est une précondition de l'attribution.
      orderBy: { occurredAt: "desc" },
      select: SELECTED,
    });
    return rows.map((row) => toFact(row));
  }

  async factsBetween(
    types: readonly string[],
    since: Date,
    until: Date,
  ): Promise<readonly PimJournalFact[]> {
    if (types.length === 0) {
      return [];
    }
    const rows = await this.prisma.activityEvent.findMany({
      where: { type: { in: [...types] }, occurredAt: { gt: since, lte: until } },
      orderBy: { occurredAt: "desc" },
      select: SELECTED,
    });
    return rows.map((row) => toFact(row));
  }
}

/** Ce qu'un fait rend — la même sélection des deux côtés, pour une seule forme. */
const SELECTED = {
  type: true,
  subjectType: true,
  subjectId: true,
  occurredAt: true,
  actorName: true,
  payload: true,
} as const;

function toFact(row: {
  type: string;
  subjectType: string;
  subjectId: string;
  occurredAt: Date;
  actorName: string | null;
  payload: unknown;
}): PimJournalFact {
  return {
    type: row.type,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt,
    actorName: row.actorName,
    payload: row.payload,
  };
}

@Global()
@Module({
  imports: [GrowthModule],
  providers: [
    { provide: Journal, useClass: ActivityJournal },
    { provide: PimJournal, useClass: PimActivityJournal },
    { provide: PimJournalReader, useClass: PimActivityJournalReader },
  ],
  exports: [Journal, PimJournal, PimJournalReader],
})
export class JournalModule {}
