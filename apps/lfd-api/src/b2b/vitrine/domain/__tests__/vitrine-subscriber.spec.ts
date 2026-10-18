import {
  VitrineContentUnknownError,
  VitrineSubscriberInactiveError,
  VitrineSubscriberNameInvalidError,
} from "../errors/vitrine-errors.js";
import { VitrineSubscriber } from "../vitrine-subscriber.js";
import { AT, LATER, subscriber } from "./vitrine-fixtures.js";

describe("un abonné de la vitrine", () => {
  it("naît allumé, sans échec, à la séquence zéro, ses cases rangées sans doublon", () => {
    const declared = subscriber({ contents: ["texts", "catalogue", "texts"] });
    expect(declared.isDeliverable).toBe(true);
    expect(declared.toPersistence()).toMatchObject({
      active: true,
      failedAt: null,
      lastSequence: 0,
      contents: ["catalogue", "texts"],
    });
  });

  it("refuse un nom vide et une case inconnue", () => {
    expect(() => subscriber({ contents: ["promotions"] })).toThrow(VitrineContentUnknownError);
    expect(() =>
      VitrineSubscriber.declare({
        id: "s",
        name: "  ",
        endpointUrl: "https://a.example/",
        contents: [],
        credentials: { signingSecretSealed: "x", readKeyHash: "y" },
        at: AT,
      }),
    ).toThrow(VitrineSubscriberNameInvalidError);
  });

  it("tire des séquences strictement croissantes", () => {
    const declared = subscriber();
    expect([declared.takeSequence(LATER), declared.takeSequence(LATER)]).toEqual([1, 2]);
    expect(declared.toPersistence().lastSequence).toBe(2);
  });

  it("en échec, ne livre plus ; rallumer ne lève pas l'échec, « tout renvoyer » si", () => {
    const declared = subscriber();
    declared.markFailed(LATER);
    expect(declared.isDeliverable).toBe(false);
    declared.setActive(false, LATER);
    declared.setActive(true, LATER);
    expect(declared.isDeliverable).toBe(false);
    declared.resynchronize(LATER);
    expect(declared.isDeliverable).toBe(true);
  });

  it("refuse de tout renvoyer à un abonné coupé", () => {
    const declared = subscriber();
    declared.setActive(false, LATER);
    expect(() => declared.resynchronize(LATER)).toThrow(VitrineSubscriberInactiveError);
  });

  it("une rotation remplace le secret scellé et l'empreinte de la clé", () => {
    const declared = subscriber();
    declared.rotate({ signingSecretSealed: "neuf", readKeyHash: "neuve" }, LATER);
    expect(declared.toPersistence()).toMatchObject({
      signingSecretSealed: "neuf",
      readKeyHash: "neuve",
      updatedAt: LATER,
    });
  });

  it("se réhydrate en revalidant l'adresse", () => {
    const row = { ...subscriber().toPersistence(), endpointUrl: "http://a.example/" };
    expect(() => VitrineSubscriber.rehydrate(row)).toThrow();
  });
});
