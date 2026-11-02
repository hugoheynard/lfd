import { WeightResupplyNotSendableError } from "./resupply-sale-unit-errors.js";
import type { SiteResupplyLine } from "./site-resupply-line.js";

/**
 * **La garde d'envoi au poids** (lot L2b-1 du plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §14) — un
 * réassort qui porte une ligne au poids ne part pas au fournil tant que le
 * colisage et le transfert la compteraient en pièces. Le fournil la sait
 * depuis L2b-2 (unité recopiée à l'arrêt, comptée et imprimée en grammes) ;
 * le fait `production.resupply_list_drawn` et sa lecture au colisage
 * (`resupplyLinesOf`, `on-resupply-list-drawn.handler.ts`) ne portent pas
 * encore l'unité, et `PackedResuppliesReader` rend des pièces (vérifié le
 * 2026-11-02). Appelée par `SiteResupply.place`, le seul
 * passage de brouillon à envoyé : demande du comptoir, envoi du fournil,
 * sortie de réserve.
 *
 * Le réassort SANS commande (`ResupplyReceipt`) n'envoie rien au fournil : il
 * n'est pas gardé. À retirer au lot L2b-3.
 *
 * @throws {WeightResupplyNotSendableError} une ligne au moins est au poids.
 */
export function assertSendableToBakehouse(lines: readonly SiteResupplyLine[]): void {
  const weighed = lines.filter((line) => line.saleUnit === "weight");
  if (weighed.length > 0) {
    throw new WeightResupplyNotSendableError(weighed.map((line) => line.label));
  }
}
