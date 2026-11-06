import type { ClientSheet } from "@lfd/contracts";
import type { MailCta } from "@lfd/mailer";

/**
 * Le point GPS d'un site de retrait, en degrés décimaux — quand l'appelant le
 * connaît. Aucun appelant ne le passe encore (vérifié le 2026-10-23) : la
 * feuille projetée ne porte que l'adresse, et l'itinéraire se fait alors sur
 * elle.
 */
export interface PickupPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Le lien universel d'itinéraire de Google Maps : il ouvre l'application sur
 * un téléphone qui l'a, le site sinon, et ne demande aucune clé.
 * https://developers.google.com/maps/documentation/urls/get-started
 */
const DIRECTIONS_URL = "https://www.google.com/maps/dir/?api=1&destination=";

/**
 * **« Itinéraire vers la boutique »** — le bouton d'une commande EN RETRAIT
 * (plan `plan-textes-des-e-mails.md`, E4, S7). Sur le point GPS s'il est
 * connu, sinon sur l'adresse figée dans la commande ; rien pour une
 * livraison, ni pour un retrait dont on ne sait pas où il se fait.
 */
export function pickupItinerary(
  sheet: ClientSheet,
  point: PickupPoint | null | undefined,
  label: string,
): { readonly itinerary?: MailCta } {
  if (sheet.fulfillment.method !== "pickup") {
    return {};
  }
  const destination =
    point === null || point === undefined
      ? addressOf(sheet)
      : `${String(point.latitude)},${String(point.longitude)}`;
  return destination === ""
    ? {}
    : { itinerary: { label, url: `${DIRECTIONS_URL}${encodeURIComponent(destination)}` } };
}

/** L'adresse en une ligne, comme on la taperait dans la carte. */
function addressOf(sheet: ClientSheet): string {
  const address = sheet.fulfillment.address;
  if (address === null) {
    return "";
  }
  return [
    address.ligne1,
    address.ligne2,
    `${address.codePostal} ${address.ville}`.trim(),
    address.pays,
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}
