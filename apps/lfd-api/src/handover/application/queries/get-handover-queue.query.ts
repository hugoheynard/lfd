/**
 * **Quelle file** : celle du comptoir, ou la journée entière.
 *
 * - `counter` — le poste du comptoir (`handover_counter`) : les retraits
 *   seuls. Une livraison part par coursier, personne ne l'attend devant ce
 *   comptoir, et sa tournée est la matière de `delivery_rounds`, pas de ce
 *   droit (une route par usage, décidé par Hugo le 2026-11-13).
 * - `whole_day` — la Supervision (`b2b_supervision`) : tout, livraisons et
 *   tournées comprises.
 *
 * Le périmètre est posé par la ROUTE, jamais par l'écran qui la lit.
 */
export type HandoverQueueScope = "counter" | "whole_day";

/** La file d'un jour de service (`AAAA-MM-JJ`), dans un périmètre. */
export class GetHandoverQueueQuery {
  constructor(
    readonly day: string,
    readonly scope: HandoverQueueScope,
  ) {}
}
