import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  pricingJournalPageQuerySchema,
  pricingSubjectSchema,
  type PricingJournalEntryView,
  type PricingJournalPageQuery,
  type PricingJournalPageView,
  type PricingSubjectType,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadPricingJournalQuery } from "../application/queries/read-pricing-journal.query.js";
import { ReadSubjectJournalPageQuery } from "../application/queries/read-subject-journal-page.query.js";
import { ReadSubjectJournalQuery } from "../application/queries/read-subject-journal.query.js";
import { UnknownPricingSubjectError } from "../domain/pricing-errors.js";

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

  /**
   * Une page du journal d'un sujet, dans un instantané ancré par `asOf`.
   *
   * Une route à part plutôt qu'un paramètre de l'ancienne : celle-ci rend un
   * tableau nu que le front en ligne lit, et une page porte son total.
   */
  @Get(":subjectType/:subjectId/pages")
  pageForSubject(
    @Param("subjectType") subjectType: string,
    @Param("subjectId") subjectId: string,
    @Query(new ZodQuery(pricingJournalPageQuerySchema)) query: PricingJournalPageQuery,
  ): Promise<PricingJournalPageView> {
    return this.queries.execute<ReadSubjectJournalPageQuery, PricingJournalPageView>(
      new ReadSubjectJournalPageQuery(
        parseSubjectType(subjectType),
        subjectId,
        query.page,
        query.pageSize,
        query.asOf ?? null,
      ),
    );
  }

  /**
   * Tout ce qui est arrivé à cette règle ou à cette limite, du plus récent au
   * plus ancien — deux cents actes au plus, en tableau nu.
   *
   * @deprecated remplacée par `GET :subjectType/:subjectId/pages` (2026-09-19).
   * Le front en ligne la lit encore : elle part quand l'écran paginé est
   * déployé, pas avant, et sa forme ne change pas d'ici là.
   */
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
 *
 * Les sujets sont ceux du contrat, `mercuriale` compris : la liste locale s'en
 * était écartée, et le journal d'une mercuriale était refusé alors que ses actes
 * sont écrits (2026-09-19).
 */
function parseSubjectType(value: string): PricingSubjectType {
  const subject = pricingSubjectSchema.safeParse(value);
  if (!subject.success) {
    throw new UnknownPricingSubjectError(value);
  }
  return subject.data;
}
