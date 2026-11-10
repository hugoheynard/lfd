import { DEFAULT_CONTACT_SETTINGS } from "@lfd/contracts";

import { ContactSettings } from "../contact-settings.js";
import {
  ContactCardSilentError,
  ContactCardUnreachableError,
  ContactTextTooLongError,
} from "../errors/contact-errors.js";

const AUTHOR = { staffUserId: "staff_1", name: "Camille", role: "admin" };

describe("ContactSettings — la carte de contact", () => {
  it("se pose rognée, vide permis (la boutique garde son dictionnaire)", () => {
    const blank = { fr: "  Une question ? ", en: "", it: "" };
    const settings = ContactSettings.pose({
      settings: {
        cards: {
          ...DEFAULT_CONTACT_SETTINGS.cards,
          b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, kicker: blank, title: blank, body: blank },
        },
      },
      at: new Date(0),
      author: AUTHOR,
      phones: [],
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
        phones: [],
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
            b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, title: long, body: long },
          },
        },
        at: new Date(0),
        author: AUTHOR,
        phones: [],
      }),
    ).toThrow(ContactTextTooLongError);
  });

  describe("les interrupteurs et le message sans contact (Hugo, 2026-10-26)", () => {
    const EMPTY = { fr: "", en: "", it: "" };
    const B2C_PHONE = { audience: "b2c" as const, active: true };
    const pose = (
      b2c: Partial<typeof DEFAULT_CONTACT_SETTINGS.cards.b2c>,
      phones: readonly { audience: "b2b" | "b2c" | "both"; active: boolean }[] = [B2C_PHONE],
    ) =>
      ContactSettings.pose({
        settings: {
          cards: {
            ...DEFAULT_CONTACT_SETTINGS.cards,
            b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, ...b2c },
          },
        },
        at: new Date(0),
        author: AUTHOR,
        phones,
      });

    it("par défaut, numéro et formulaire sont affichés", () => {
      const settings = pose({});
      expect(settings.cards.b2c).toMatchObject({ showPhone: true, showForm: true });
    });

    it("refuse une carte sans numéro ni formulaire qui ne dit rien", () => {
      expect(() => pose({ showPhone: false, showForm: false, noContactMessage: EMPTY })).toThrow(
        ContactCardSilentError,
      );
    });

    it("refuse aussi un message fait de blancs, ou écrit seulement en anglais", () => {
      expect(() =>
        pose({
          showPhone: false,
          showForm: false,
          noContactMessage: { fr: "  ", en: "Soon", it: "" },
        }),
      ).toThrow(/doit dire quelque chose/u);
    });

    it("accepte une carte sans contact qui dit quelque chose, rogné", () => {
      const settings = pose({
        showPhone: false,
        showForm: false,
        noContactMessage: { fr: " Nous vous contacterons bientôt ", en: "", it: "" },
      });
      expect(settings.cards.b2c.noContactMessage.fr).toBe("Nous vous contacterons bientôt");
    });

    it("affiche le numéro sans numéro réglé, formulaire coupé, sans message : refusé", () => {
      expect(() => pose({ showForm: false }, [])).toThrow(ContactCardUnreachableError);
    });

    it("un seul interrupteur coupé : le message peut rester vide, s'il reste un numéro", () => {
      expect(pose({ showPhone: false }).cards.b2c.showForm).toBe(true);
      expect(pose({ showForm: false }).cards.b2c.showPhone).toBe(true);
    });

    it("rogne et borne les mots des boutons", () => {
      expect(
        pose({ callLabel: { fr: " Nous appeler ", en: "", it: "" } }).cards.b2c.callLabel.fr,
      ).toBe("Nous appeler");
      expect(() => pose({ writeLabel: { fr: "x".repeat(41), en: "", it: "" } })).toThrow(
        ContactTextTooLongError,
      );
    });
  });
});
