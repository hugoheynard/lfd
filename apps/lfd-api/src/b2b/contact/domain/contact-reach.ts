import type { ContactAudience, ContactCardText, CustomerAudience } from "@lfd/contracts";

import { ContactCardUnreachableError } from "./errors/contact-errors.js";

/** D'un numéro, ce qui dit s'il sert une clientèle. */
export interface ReachPhone {
  readonly audience: ContactAudience;
  readonly active: boolean;
}

/** Le nom d'une carte, tel que l'écran du back-office la désigne. */
export const CARD_NAMES: Readonly<Record<CustomerAudience, string>> = {
  b2b: "Carte pros",
  b2c: "Carte particuliers",
};

const AUDIENCES: readonly CustomerAudience[] = ["b2b", "b2c"];

/**
 * **Chaque carte offre un geste** (décision de Hugo, 2026-10-26) : un numéro
 * qu'elle affiche ET qui existe pour sa clientèle, ou le formulaire, ou au
 * moins son message « sans contact ». Vérifié avec les numéros tels qu'ils
 * seront APRÈS le geste — poser la carte, réviser ou archiver un numéro.
 *
 * @throws {ContactCardUnreachableError} une carte n'offrirait rien.
 */
export function assertCardsReachable(
  cards: Readonly<Record<CustomerAudience, ContactCardText>>,
  phones: readonly ReachPhone[],
): void {
  for (const audience of AUDIENCES) {
    const card = cards[audience];
    if (card.showForm || card.noContactMessage.fr.trim() !== "") {
      continue;
    }
    const hasPhone = phones.some(
      (phone) => phone.active && (phone.audience === "both" || phone.audience === audience),
    );
    if (card.showPhone && !hasPhone) {
      throw new ContactCardUnreachableError(CARD_NAMES[audience]);
    }
  }
}
