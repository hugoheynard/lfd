/**
 * **L'historique des verdicts d'une journée**, notes et photos comprises.
 * Servi en `b2b_supervision:write` seulement (D3) : la route le force.
 */
export class ListQualityChecksQuery {
  constructor(readonly serviceDay: string) {}
}
