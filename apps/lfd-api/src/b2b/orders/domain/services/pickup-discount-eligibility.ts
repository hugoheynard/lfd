/**
 * **L'assiette de la remise de retrait** — pure, partagée par le devis de la
 * boutique et la passation (§4.A.3 du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 */

/** Une ligne chiffrée : son SKU et son hors taxe, déjà arrondi une fois. */
export interface PricedLine {
  readonly sku: string;
  readonly htCents: number;
}

/** Le hors taxe des seules lignes éligibles — l'assiette de R1. */
export function eligibleSubtotalCents(
  lines: readonly PricedLine[],
  ineligible: ReadonlySet<string>,
): number {
  return lines.reduce((sum, line) => (ineligible.has(line.sku) ? sum : sum + line.htCents), 0);
}
