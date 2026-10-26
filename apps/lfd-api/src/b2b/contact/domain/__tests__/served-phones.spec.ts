import { DEFAULT_CONTACT_SETTINGS, type PublicContactPhoneView } from "@lfd/contracts";

import { servedPhones } from "../served-phones.js";

const label = { fr: "", en: "", it: "" };
const PHONES: readonly PublicContactPhoneView[] = [
  { label, number: "04 79 00 00 01", audience: "b2b" },
  { label, number: "04 79 00 00 02", audience: "both" },
  { label, number: "04 79 00 00 03", audience: "b2c" },
];
const cards = (b2b: boolean, b2c: boolean) => ({
  b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, showPhone: b2b },
  b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, showPhone: b2c },
});
const numbers = (phones: readonly PublicContactPhoneView[]) => phones.map((p) => p.number);

describe("servedPhones — les numéros qu'une carte affiche", () => {
  it("les deux cartes affichent : tout est servi", () => {
    expect(numbers(servedPhones(cards(true, true), PHONES))).toHaveLength(3);
  });

  it("carte pros coupée : ni le numéro pro, mais `both` reste pour les particuliers", () => {
    expect(numbers(servedPhones(cards(false, true), PHONES))).toEqual([
      "04 79 00 00 02",
      "04 79 00 00 03",
    ]);
  });

  it("les deux coupées : aucun numéro ne part à la boutique", () => {
    expect(servedPhones(cards(false, false), PHONES)).toEqual([]);
  });
});
