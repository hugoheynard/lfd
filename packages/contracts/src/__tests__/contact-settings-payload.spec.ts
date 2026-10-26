import { contactSettingsPayloadSchema } from "../contact.js";
import { DEFAULT_CONTACT_SETTINGS } from "../contact.values.js";

describe("contactSettingsPayloadSchema — la forme de la carte (2026-10-26)", () => {
  it("accepte les cartes par défaut : numéro et formulaire affichés", () => {
    const parsed = contactSettingsPayloadSchema.parse({ cards: DEFAULT_CONTACT_SETTINGS.cards });
    expect(parsed.cards.b2b).toMatchObject({ showPhone: true, showForm: true });
  });

  it("exige les deux interrupteurs : la forme ne devine pas un affichage", () => {
    const c = DEFAULT_CONTACT_SETTINGS.cards.b2c;
    const withoutSwitch = {
      kicker: c.kicker,
      title: c.title,
      body: c.body,
      callLabel: c.callLabel,
      writeLabel: c.writeLabel,
      showForm: c.showForm,
      noContactMessage: c.noContactMessage,
    };
    expect(
      contactSettingsPayloadSchema.safeParse({
        cards: { b2b: DEFAULT_CONTACT_SETTINGS.cards.b2b, b2c: withoutSwitch },
      }).success,
    ).toBe(false);
  });

  it("ne refuse PAS une carte sans contact ni message : c'est une règle, le domaine la tient", () => {
    const silent = { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, showPhone: false, showForm: false };
    expect(
      contactSettingsPayloadSchema.safeParse({
        cards: { b2b: DEFAULT_CONTACT_SETTINGS.cards.b2b, b2c: silent },
      }).success,
    ).toBe(true);
  });
});
