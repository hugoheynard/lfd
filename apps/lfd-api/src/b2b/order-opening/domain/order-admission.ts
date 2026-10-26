import { ordersOpenTo, type CustomerAudience, type PublicOrderOpeningView } from "@lfd/contracts";

import type { OrderOpeningExemption, OrderingParty } from "./order-opening-exemption.js";

/**
 * **La boutique prend-elle cette commande ?** — la règle entière, pure.
 *
 * Ouverte à la clientèle : oui. Fermée : seulement si une exemption active
 * couvre qui commande — sa société, ou son adresse (décision de Hugo du
 * 2026-10-26). Une exemption ne fait rien quand la boutique est ouverte, et
 * n'ouvre que la PASSATION : le reste de la fermeture ne bouge pas.
 */
export function admitsOrder(input: {
  readonly opening: PublicOrderOpeningView;
  readonly audience: CustomerAudience;
  readonly exemptions: readonly OrderOpeningExemption[];
  readonly party: OrderingParty;
}): boolean {
  if (ordersOpenTo(input.opening, input.audience)) {
    return true;
  }
  return input.exemptions.some((exemption) => exemption.covers(input.party));
}
