import type { PricingSubjectType } from "../../domain/pricing-act.js";

/**
 * « Qu'est-il arrivé à CETTE règle, à ce plancher, à ce barème ? » — du plus
 * récent au plus ancien.
 *
 * Le sujet est déjà **reconnu** quand la question se pose : un type inventé est
 * refusé à la frontière HTTP, pendant que c'est encore lisible. Descendu jusqu'à
 * la base, il ne correspondrait à rien et ressortirait en journal vide — une
 * réponse qui mentirait sur la cause.
 */
export class ReadSubjectJournalQuery {
  constructor(
    readonly subjectType: PricingSubjectType,
    readonly subjectId: string,
  ) {}
}
