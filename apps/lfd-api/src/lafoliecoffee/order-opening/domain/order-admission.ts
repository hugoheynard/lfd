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
  readonly opening: Pick<PublicOrderOpeningView, "ordersOpenToB2b" | "ordersOpenToB2c">;
  readonly audience: CustomerAudience;
  readonly exemptions: readonly OrderOpeningExemption[];
  readonly party: OrderingParty;
}): boolean {
  if (ordersOpenTo(input.opening, input.audience)) {
    return true;
  }
  return input.exemptions.some((exemption) => exemption.covers(input.party));
}

/** Le premier jour commandable posé pour une clientèle, ou `null`. */
export function firstServiceDayOfAudience(
  opening: Pick<PublicOrderOpeningView, "firstServiceDayB2b" | "firstServiceDayB2c">,
  audience: CustomerAudience,
): string | null {
  // Absent = aucune restriction : le contrat le laisse facultatif (lot J3).
  return (audience === "b2b" ? opening.firstServiceDayB2b : opening.firstServiceDayB2c) ?? null;
}

/**
 * **Le premier jour que CETTE personne peut commander** (plan
 * `plan-premier-jour-commandable.md`, 2026-10-28), ou `null` : pas de date
 * pour sa clientèle, une date déjà atteinte (`today` en est le jour ou l'a
 * dépassé), ou une exemption active qui la couvre — les exemptions passent
 * outre, comme pour la fermeture.
 *
 * `today` est la journée locale d'aujourd'hui, `AAAA-MM-JJ`, lue par
 * l'appelant à son `Clock` : la règle reste pure.
 */
export function firstServiceDayFor(input: {
  readonly opening: Pick<PublicOrderOpeningView, "firstServiceDayB2b" | "firstServiceDayB2c">;
  readonly audience: CustomerAudience;
  readonly exemptions: readonly OrderOpeningExemption[];
  readonly party: OrderingParty;
  readonly today: string;
}): string | null {
  const first = firstServiceDayOfAudience(input.opening, input.audience);
  if (first === null || first <= input.today) {
    return null;
  }
  return input.exemptions.some((exemption) => exemption.covers(input.party)) ? null : first;
}

/**
 * **La journée demandée est-elle commandable ?** — oui sans premier jour, ou
 * si elle est ce jour ou un suivant. L'ordre ISO est l'ordre du calendrier.
 * Une commande sans journée (`null`) n'est pas jugée ici : la passation exige
 * déjà une date.
 */
export function admitsServiceDay(firstServiceDay: string | null, day: string | null): boolean {
  return firstServiceDay === null || day === null || day >= firstServiceDay;
}
