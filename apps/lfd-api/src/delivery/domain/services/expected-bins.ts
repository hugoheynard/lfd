import type { PackingProposal } from "./propose-packing.js";

/**
 * **Combien de bacs la proposition de colisage prévoit** (`parcours-du-livreur.md`,
 * PL4) — un bac entier compte pour un, une moitié aussi : c'est une ligne de
 * bac déclarée, et c'est ce que « n bacs sur m » compare.
 *
 * `null` quand la proposition ne sait pas le dire — une ligne non placée
 * (produit sans contenance, froid sans bac isotherme) : un compte partiel
 * serait lu comme complet. Pure.
 */
export function expectedBinCount(proposal: PackingProposal): number | null {
  if (proposal.unplaced.length > 0) {
    return null;
  }
  return proposal.bins.reduce((count, entry) => count + entry.whole + (entry.half ? 1 : 0), 0);
}
