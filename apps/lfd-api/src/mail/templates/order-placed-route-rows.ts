import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import type { LayoutRow } from "@lfd/mailer";

import type { OrderPlacedCopy } from "./copy/mail-copy.model.js";
import { windowInWords } from "./fulfillment-window-in-words.js";
import { dayInWords } from "./service-day-in-words.js";

/** Ce qu'une ligne du récapitulatif écrit quand la feuille n'a pas la donnée. */
const NOTHING = "—";

/**
 * **Le jour et le trajet d'une confirmation, en lignes du récapitulatif**
 * (plan `plan-editeur-par-blocs.md`, § 23). Ils étaient dans la phrase
 * d'ouverture, que le staff réécrit ; ils dépendent de la commande, donc ils
 * passent au tableau, dont les libellés sont système. Le jour se tait sur une
 * commande sans jour ; le trajet dit le point de retrait (sinon sa ville) ou
 * la ville livrée, et le créneau quand il y en a un.
 */
export function orderPlacedRouteRows(
  sheet: Pick<ClientSheet, "requestedFor" | "fulfillment">,
  copy: OrderPlacedCopy,
  locale: ContentLocale,
): readonly LayoutRow[] {
  const day = dayInWords(sheet.requestedFor, locale);
  const { method, pickupLabel, address, window } = sheet.fulfillment;
  const city = nonBlank(address?.ville);
  const where = method === "pickup" ? (nonBlank(pickupLabel) ?? city) : city;
  const slot = windowInWords(window, copy);
  const route = [where, slot].filter((part): part is string => part !== null).join(" ");
  return [
    ...(day === null ? [] : [{ label: copy.recapDay, value: day }]),
    {
      label: method === "pickup" ? copy.recapPickup : copy.recapDelivery,
      value: route === "" ? NOTHING : route,
    },
  ];
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
