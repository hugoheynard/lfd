import { DEFAULT_CONTACT_SETTINGS } from "@lfd/contracts";

import { ContactSettings } from "../contact-settings.js";
import { ContactTextTooLongError } from "../errors/contact-errors.js";

const AUTHOR = { staffUserId: "staff_1", name: "Camille", role: "admin" };

describe("ContactSettings — la carte de contact", () => {
  it("se pose rognée, vide permis (la boutique garde son dictionnaire)", () => {
    const blank = { fr: "  Une question ? ", en: "", it: "" };
    const settings = ContactSettings.pose({
      settings: {
        cards: {
          ...DEFAULT_CONTACT_SETTINGS.cards,
          b2b: { kicker: blank, title: blank, body: blank },
        },
      },
      at: new Date(0),
      author: AUTHOR,
    });
    expect(settings.cards.b2b.title.fr).toBe("Une question ?");
    expect(settings.cards.b2b.kicker.fr).toBe("Une question ?");
    expect(settings.cards.b2c.title.fr).toBe("");
  });

  it("refuse un surtitre trop long", () => {
    const kicker = { fr: "x".repeat(61), en: "", it: "" };
    expect(() =>
      ContactSettings.pose({
        settings: {
          cards: {
            ...DEFAULT_CONTACT_SETTINGS.cards,
            b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, kicker },
          },
        },
        at: new Date(0),
        author: AUTHOR,
      }),
    ).toThrow(ContactTextTooLongError);
  });

  it("refuse une phrase trop longue", () => {
    const long = { fr: "x".repeat(401), en: "", it: "" };
    expect(() =>
      ContactSettings.pose({
        settings: {
          cards: {
            ...DEFAULT_CONTACT_SETTINGS.cards,
            b2b: { kicker: { fr: "", en: "", it: "" }, title: long, body: long },
          },
        },
        at: new Date(0),
        author: AUTHOR,
      }),
    ).toThrow(ContactTextTooLongError);
  });
});
