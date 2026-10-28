import type { ClientSheet, ContentLocale, FulfillmentWindow } from "@lfd/contracts";

import type { OrderPlacedCopy } from "./copy/mail-copy.model.js";
import { fill } from "./copy/mail-copy.js";
import { dayInWords } from "./service-day-in-words.js";

/**
 * La phrase d'ouverture de la confirmation : « Votre commande LF-4821 pour le
 * vendredi 27 novembre, en retrait au Labo, a bien été prise en compte par nos
 * services. » Elle remplace une phrase qui promettait « la fournée de demain
 * matin » à toute commande, quel que soit son jour (2026-10-28).
 */
export function orderPlacedIntro(
  sheet: ClientSheet,
  copy: OrderPlacedCopy,
  locale: ContentLocale,
): string {
  const routing = routingOf(sheet, copy, locale);
  const day = dayInWords(sheet.requestedFor, locale);
  return day === null
    ? fill(copy.introWithoutDay, { ref: sheet.reference, routing })
    : fill(copy.intro, { ref: sheet.reference, day, routing });
}

function routingOf(sheet: ClientSheet, copy: OrderPlacedCopy, locale: ContentLocale): string {
  const { method, pickupLabel, address, window } = sheet.fulfillment;
  const city = nonBlank(address?.ville);
  const where =
    method === "pickup"
      ? placeOrBare(
          copy.routingPickup,
          copy.routingPickupWithoutPlace,
          "place",
          nonBlank(pickupLabel) ?? city,
        )
      : placeOrBare(copy.routingDelivery, copy.routingDeliveryWithoutCity, "city", city);
  const slot = windowOf(window, copy);
  const routing = slot === null ? where : `${where} ${slot}`;
  return locale === "fr" ? contractFrenchAt(routing) : routing;
}

function placeOrBare(
  withPlace: string,
  bare: string,
  key: "place" | "city",
  value: string | null,
): string {
  return value === null ? bare : fill(withPlace, { [key]: value });
}

function windowOf(window: FulfillmentWindow | null, copy: OrderPlacedCopy): string | null {
  if (window === null) {
    return null;
  }
  return window.start === null
    ? fill(copy.windowBefore, { end: window.end })
    : fill(copy.windowBetween, { start: window.start, end: window.end });
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * « à Le Labo » → « au Labo », « à Les Arcs » → « aux Arcs » : la contraction
 * que le français impose devant un nom propre à article, et qu'un texte à
 * trou ne peut pas écrire lui-même.
 */
function contractFrenchAt(text: string): string {
  return text.replace(/(^|\s)à Les /gu, "$1aux ").replace(/(^|\s)à Le /gu, "$1au ");
}
