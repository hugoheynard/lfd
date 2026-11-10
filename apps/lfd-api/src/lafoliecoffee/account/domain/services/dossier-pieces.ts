import type { ActivationPiece } from "@lfd/contracts";

/**
 * Ce que la société porte AUJOURD'HUI, réduit à ce qui dit si une pièce est là.
 * L'adaptateur le lit sur ses propres tables — aucune lecture du journal.
 */
export interface DossierFacts {
  readonly vatNumber: string;
  readonly kbisDeposited: boolean;
  readonly hasBillingAddress: boolean;
  readonly hasDeliveryAddress: boolean;
}

/** L'ordre canonique : celui de l'étage Activation, que les écrans connaissent. */
const ORDER: readonly ActivationPiece[] = ["vat", "kbis", "billing", "delivery"];

/**
 * Les pièces présentes dans le dossier, dans l'ordre canonique — ce que lit le
 * pipeline d'activation de Comptes clients (plan auto-acquisition pro, P1).
 *
 * C'est un CONSTAT de présence, pas le verdict d'activation : `activationGate`
 * répond à « peut-on activer ? » et tient compte de l'assujettissement et du
 * principal payeur ; ici, une TVA compte quand un numéro est saisi, comme le
 * fait `company.step_reached` qu'émettent les handlers de saisie. La livraison
 * reste rendue : c'est un fait ; l'écran compte sur trois et la montre à part
 * (Hugo, 2026-10-25), parce que la porte d'activation ne l'exige plus.
 */
export function dossierPieces(facts: DossierFacts): ActivationPiece[] {
  const present: Readonly<Record<ActivationPiece, boolean>> = {
    vat: facts.vatNumber.trim() !== "",
    kbis: facts.kbisDeposited,
    billing: facts.hasBillingAddress,
    delivery: facts.hasDeliveryAddress,
  };
  return ORDER.filter((piece) => present[piece]);
}
