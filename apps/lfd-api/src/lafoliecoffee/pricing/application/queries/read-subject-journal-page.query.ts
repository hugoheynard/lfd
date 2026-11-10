import type { PricingSubjectType } from "../../domain/pricing-act.js";

/**
 * « Qu'est-il arrivé à ce sujet ? », une page à la fois, dans un instantané.
 *
 * Le sujet est déjà **reconnu** quand la question se pose, comme pour
 * `ReadSubjectJournalQuery` ; la forme de `page`, `pageSize` et `asOf` a
 * été vérifiée à la frontière HTTP.
 */
export class ReadSubjectJournalPageQuery {
  constructor(
    readonly subjectType: PricingSubjectType,
    readonly subjectId: string,
    readonly page: number,
    readonly pageSize: number,
    readonly asOf: string | null,
  ) {}
}
