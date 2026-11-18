/** Une fournée d'une journée qui porte une part corrigée. */
export interface DeclarationCorrection {
  /** L'`id` de la remise au colisage — celui de la fournée. */
  readonly handoffId: string;
  readonly sku: string;
  /** Sa part corrigée en tout : des pièces remises qui n'ont jamais existé. */
  readonly corrected: number;
}

/**
 * **« Les corrections de déclaration d'une journée »** — lecture nommée que le
 * fournil DÉCLARE et IMPLÉMENTE (
 * `documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Le colisage la relit à chaque correction, à chaque remise reçue et au
 * rattrapage du démarrage : c'est un cumul par fournée, et rien ne se perd,
 * même pour une correction publiée (`production.output_corrected`) avant
 * qu'il ne l'écoute. Seules les fournées vivantes à part corrigée non
 * nulle, triées par `handoffId`.
 */
export abstract class OutputCorrectionsReader {
  abstract correctionsOf(serviceDay: string): Promise<readonly DeclarationCorrection[]>;
}
