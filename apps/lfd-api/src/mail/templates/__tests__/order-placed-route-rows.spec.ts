import type { SheetFulfillment } from "@lfd/contracts";

import { mailCopyOf } from "../copy/mail-copy.js";
import { orderPlacedRouteRows } from "../order-placed-route-rows.js";

/**
 * Le jour et le trajet de la confirmation, passés de la phrase d'ouverture au
 * récapitulatif (plan `plan-editeur-par-blocs.md`, § 23). Le jour est le SUJET
 * de ces cas, jamais comparé à l'horloge : une date écrite est admise.
 */

const PICKUP: SheetFulfillment = {
  method: "pickup",
  address: {
    label: "Le Labo",
    pays: "France",
    ligne1: "route de la Balme",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
  },
  pickupLabel: "Le Labo",
  window: null,
  contact: null,
  signatureRequired: false,
};

const DELIVERY: SheetFulfillment = { ...PICKUP, method: "delivery", pickupLabel: null };

function rows(
  requestedFor: string | null,
  fulfillment: SheetFulfillment,
  locale: "fr" | "en" | "it" = "fr",
): readonly (readonly [string, string])[] {
  return orderPlacedRouteRows(
    { requestedFor, fulfillment },
    mailCopyOf(locale)["customer.order-placed"],
    locale,
  ).map((row) => [row.label, row.value] as const);
}

describe("orderPlacedRouteRows", () => {
  it("dit le jour demandé, puis le point de retrait", () => {
    expect(rows("2026-11-27", PICKUP)).toEqual([
      ["Jour", "vendredi 27 novembre"],
      ["Retrait", "Le Labo"],
    ]);
  });

  it.each([
    ["en", "Day", "Friday, November 27", "Pickup"],
    ["it", "Giorno", "venerdì 27 novembre", "Ritiro"],
  ] as const)("parle la langue du destinataire — %s", (locale, day, when, pickup) => {
    expect(rows("2026-11-27", PICKUP, locale)).toEqual([
      [day, when],
      [pickup, "Le Labo"],
    ]);
  });

  it("une livraison dit sa ville et son créneau, borné ou non", () => {
    expect(rows(null, { ...DELIVERY, window: { start: "07:00", end: "09:00" } })).toEqual([
      ["Livraison", "Val d'Isère entre 07:00 et 09:00"],
    ]);
    expect(rows(null, { ...DELIVERY, window: { start: null, end: "08:00" } })).toEqual([
      ["Livraison", "Val d'Isère avant 08:00"],
    ]);
  });

  it("sans jour, la ligne du jour se tait", () => {
    expect(rows(null, PICKUP).map(([label]) => label)).toEqual(["Retrait"]);
  });

  it("un retrait sans nom de point dit sa ville ; sans rien, un tiret", () => {
    expect(rows(null, { ...PICKUP, pickupLabel: "  " })).toEqual([["Retrait", "Val d'Isère"]]);
    expect(rows(null, { ...DELIVERY, address: null })).toEqual([["Livraison", "—"]]);
  });
});
