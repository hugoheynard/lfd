/** Quel papier d'une version : le dossier du jour, ou le compte à produire. */
export type PlanVersionPaperKind = "dossier" | "count";

/**
 * **Le papier RANGÉ d'une version du plan**
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H6) — jamais
 * refabriqué.
 */
export class GetPlanVersionPaperQuery {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly version: number,
    readonly kind: PlanVersionPaperKind,
  ) {}
}
