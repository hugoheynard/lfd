import type { ClientSheet, ContentLocale, SheetFulfillment } from "@lfd/contracts";

import { mailCopyOf } from "../copy/mail-copy.js";
import { orderPlacedIntro } from "../order-placed-intro.js";

/**
 * La phrase d'ouverture de la confirmation. Régression : elle promettait « la
 * fournée de demain matin » à toute commande, quel que soit son jour
 * (2026-10-28).
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

function intro(
  locale: ContentLocale,
  requestedFor: string | null,
  fulfillment: SheetFulfillment,
): string {
  const sheet = { reference: "LF-4821", requestedFor, fulfillment } as const;
  return orderPlacedIntro(
    // Seuls ces trois champs sont lus ; le reste de la feuille n'a rien à dire ici.
    { ...({} as ClientSheet), ...sheet },
    mailCopyOf(locale)["customer.order-placed"],
    locale,
  );
}

describe("orderPlacedIntro", () => {
  it.each([
    [
      "fr",
      "Votre commande LF-4821 pour le vendredi 27 novembre, en retrait au Labo, a bien été prise en compte par nos services.",
    ],
    [
      "en",
      "Your order LF-4821 for Friday, November 27, for pickup at Le Labo, has been received by our team.",
    ],
    [
      "it",
      "Il suo ordine LF-4821 per venerdì 27 novembre, con ritiro a Le Labo, è stato preso in carico dai nostri servizi.",
    ],
  ] as const)("dit le jour et le point de retrait — %s", (locale, expected) => {
    expect(intro(locale, "2026-11-27", PICKUP)).toBe(expected);
  });

  it.each([
    [
      "fr",
      "Votre commande LF-4821, en livraison à Val d'Isère, a bien été prise en compte par nos services.",
    ],
    ["en", "Your order LF-4821, for delivery to Val d'Isère, has been received by our team."],
    [
      "it",
      "Il suo ordine LF-4821, con consegna a Val d'Isère, è stato preso in carico dai nostri servizi.",
    ],
  ] as const)("sans jour, omet « pour le » — livraison %s", (locale, expected) => {
    expect(intro(locale, null, DELIVERY)).toBe(expected);
  });

  it("ajoute le créneau, borné ou non", () => {
    expect(
      intro("fr", "2026-11-27", { ...DELIVERY, window: { start: "07:00", end: "09:00" } }),
    ).toContain("en livraison à Val d'Isère entre 07:00 et 09:00,");
    expect(intro("fr", null, { ...DELIVERY, window: { start: null, end: "08:00" } })).toContain(
      "en livraison à Val d'Isère avant 08:00,",
    );
  });

  it("retombe sur la ville sans point nommé, et sur le mode seul sans rien", () => {
    expect(intro("fr", null, { ...PICKUP, pickupLabel: null })).toContain(
      "en retrait à Val d'Isère,",
    );
    expect(intro("fr", null, { ...DELIVERY, address: null })).toContain(
      "LF-4821, en livraison, a bien",
    );
  });

  it("contracte « à Les » en « aux »", () => {
    expect(intro("fr", null, { ...PICKUP, pickupLabel: "Les Arcs" })).toContain(
      "en retrait aux Arcs,",
    );
  });
});
