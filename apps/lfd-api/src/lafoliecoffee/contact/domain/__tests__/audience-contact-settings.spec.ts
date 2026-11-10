import { DEFAULT_CONTACT_SETTINGS, type PublicContactPhoneView } from "@lfd/contracts";

import { audienceContactSettingsOf } from "../audience-contact-settings.js";

const label = { fr: "", en: "", it: "" };
const PHONES: readonly PublicContactPhoneView[] = [
  { label, number: "04 79 00 00 01", audience: "b2b" },
  { label, number: "04 79 00 00 02", audience: "both" },
  { label, number: "04 79 00 00 03", audience: "b2c" },
];
const title = (fr: string) => ({ fr, en: "", it: "" });
const cards = (b2b: boolean, b2c: boolean) => ({
  b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, title: title("Pros"), showPhone: b2b },
  b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, title: title("Particuliers"), showPhone: b2c },
});
const numbers = (phones: readonly PublicContactPhoneView[]) => phones.map((p) => p.number);

describe("audienceContactSettingsOf — une carte, ses numéros", () => {
  it("les particuliers : leur carte, leurs numéros et `both`, jamais celui des pros", () => {
    const served = audienceContactSettingsOf(cards(true, true), PHONES, "b2c");
    expect(served.card.title.fr).toBe("Particuliers");
    expect(numbers(served.phones)).toEqual(["04 79 00 00 02", "04 79 00 00 03"]);
  });

  it("les pros : leur carte, leurs numéros et `both`, jamais celui des particuliers", () => {
    const served = audienceContactSettingsOf(cards(true, true), PHONES, "b2b");
    expect(served.card.title.fr).toBe("Pros");
    expect(numbers(served.phones)).toEqual(["04 79 00 00 01", "04 79 00 00 02"]);
  });

  it("carte qui coupe le numéro : aucun numéro, même `both`", () => {
    expect(audienceContactSettingsOf(cards(false, true), PHONES, "b2b").phones).toEqual([]);
  });

  it("aucune clé par public dans ce qui part", () => {
    const json = JSON.stringify(audienceContactSettingsOf(cards(true, true), PHONES, "b2c"));
    expect(Object.keys(JSON.parse(json) as object).sort()).toEqual(["card", "phones"]);
    expect(json).not.toContain("Pros");
    expect(json).not.toContain("04 79 00 00 01");
  });
});
