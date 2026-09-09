import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ReadPricingJournalQuery } from "../application/queries/read-pricing-journal.query.js";
import { ReadSubjectJournalQuery } from "../application/queries/read-subject-journal.query.js";
import { UnknownPricingSubjectError } from "../domain/pricing-errors.js";
import type { PricingJournalEntryView } from "@lfd/contracts";

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
@AdminSurface("b2b_pricing")
export class AdminPricingJournalController {
  constructor(private readonly queries: QueryBus) {}

  /** Les derniers actes, tous sujets confondus — « qui a touché aux prix ». */
  @Get()
  recent(): Promise<PricingJournalEntryView[]> {
    return this.queries.execute<ReadPricingJournalQuery, PricingJournalEntryView[]>(
      new ReadPricingJournalQuery(),
    );
  }

  /** Tout ce qui est arrivé à cette règle ou à cette limite, du plus récent au plus ancien. */
  @Get(":subjectType/:subjectId")
  forSubject(
    @Param("subjectType") subjectType: string,
    @Param("subjectId") subjectId: string,
  ): Promise<PricingJournalEntryView[]> {
    return this.queries.execute<ReadSubjectJournalQuery, PricingJournalEntryView[]>(
      new ReadSubjectJournalQuery(parseSubjectType(subjectType), subjectId),
    );
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
