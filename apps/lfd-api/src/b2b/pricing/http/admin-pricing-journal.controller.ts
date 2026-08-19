import { Controller, Get, Param } from "@nestjs/common";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { PricingJournalReader } from "../domain/ports/pricing-journal.reader.js";
import { UnknownPricingSubjectError } from "../domain/pricing-errors.js";
import type { PricingJournalEntryView } from "@lfd/contracts";
import type { JournalEntry } from "../domain/ports/pricing-journal.reader.js";

/** Au-delà, ce n'est plus une histoire, c'est un fichier de logs. */
const RECENT_ENTRIES = 50;

const SUBJECT_TYPES = ["rule", "floor", "ladder"] as const;

/**
 * **Le journal des décisions tarifaires** — qui a posé, qui a arrêté, quand.
 *
 * Un contrôleur à part, et **en lecture seule**. Il n'existe aucune route pour
 * ajouter un acte, en corriger un, ou en retirer un : les actes s'écrivent avec
 * la mutation qu'ils racontent, dans la même transaction, par les dépôts. Un
 * journal auquel on peut écrire séparément est un journal qu'on peut arranger.
 */
@Controller("admin/pricing/journal")
@AdminSurface("settings")
export class AdminPricingJournalController {
  constructor(private readonly journal: PricingJournalReader) {}

  /** Les derniers actes, tous sujets confondus — « qui a touché aux prix ». */
  @Get()
  async recent(): Promise<PricingJournalEntryView[]> {
    const entries = await this.journal.recent(RECENT_ENTRIES);
    return entries.map(journalView);
  }

  /** Tout ce qui est arrivé à cette règle ou à cette limite, du plus récent au plus ancien. */
  @Get(":subjectType/:subjectId")
  async forSubject(
    @Param("subjectType") subjectType: string,
    @Param("subjectId") subjectId: string,
  ): Promise<PricingJournalEntryView[]> {
    const entries = await this.journal.forSubject(parseSubjectType(subjectType), subjectId);
    return entries.map(journalView);
  }
}

/**
 * Refusé à la frontière, pendant que c'est encore lisible : un sujet inventé
 * descendrait jusqu'à la base, n'y correspondrait à rien, et ressortirait en
 * journal vide — une réponse qui mentirait sur la cause.
 */
function parseSubjectType(value: string): (typeof SUBJECT_TYPES)[number] {
  const match = SUBJECT_TYPES.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new UnknownPricingSubjectError(value);
  }
  return match;
}

/** Acte de domaine → vue de fil. Les dates traversent en ISO, comme partout. */
function journalView(entry: JournalEntry): PricingJournalEntryView {
  return {
    id: entry.id,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    act: entry.kind,
    actor: entry.actor,
    occurredAt: entry.at.toISOString(),
    reason: entry.reason,
    summary: entry.summary,
  };
}
