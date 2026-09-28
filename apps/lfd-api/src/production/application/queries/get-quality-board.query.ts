/**
 * **Les pastilles du contrôle qualité d'une journée** — verdict courant,
 * péremption (D5) et commandes retenues (D4, D6). Lisible en
 * `b2b_supervision:read` : ni note, ni photo (D3).
 */
export class GetQualityBoardQuery {
  constructor(readonly serviceDay: string) {}
}
