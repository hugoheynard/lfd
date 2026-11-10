import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import {
  VitrineContentUnknownError,
  VitrineEndpointNotHttpsError,
  VitrineSubscriberDescriptionTooLongError,
  VitrineSubscriberInactiveError,
  VitrineSubscriberNameInvalidError,
  VitrineSubscriberReadOnlyError,
} from "../errors/vitrine-errors.js";
import { VITRINE_SUBSCRIBER_DESCRIPTION_MAX, VitrineSubscriber } from "../vitrine-subscriber.js";
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
        description: null,
        contactEmail: null,
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

  it("se renomme et se décrit ; une description blanche vaut « aucune »", () => {
    const declared = subscriber();
    declared.rename("  Agence Lumière  ", LATER);
    declared.describe("  Le site public de la boutique. ", LATER);
    expect(declared.toPersistence()).toMatchObject({
      name: "Agence Lumière",
      description: "Le site public de la boutique.",
      updatedAt: LATER,
    });
    declared.describe("   ", LATER);
    expect(declared.description).toBeNull();
  });

  it("range un contact en minuscules, l'efface sur une saisie vide, refuse une adresse mal formée", () => {
    const declared = subscriber();
    declared.setContact(" Equipe@Agence.Example ", LATER);
    expect(declared.toPersistence().contactEmail).toBe("equipe@agence.example");
    expect(() => declared.setContact("pas-une-adresse", LATER)).toThrow(InvalidEmailError);
    declared.setContact("", LATER);
    expect(declared.contactEmail).toBeNull();
  });

  it("refuse un nom vide au renommage et une description trop longue", () => {
    const declared = subscriber();
    expect(() => declared.rename(" ", LATER)).toThrow(VitrineSubscriberNameInvalidError);
    expect(() =>
      declared.describe("x".repeat(VITRINE_SUBSCRIBER_DESCRIPTION_MAX + 1), LATER),
    ).toThrow(VitrineSubscriberDescriptionTooLongError);
    expect(declared.toPersistence()).toMatchObject({ name: "Agence du site", description: null });
  });

  describe("en lecture seule (sans adresse, 2026-10-20)", () => {
    it("naît sans adresse quand elle est absente ou vide, et n'est jamais livrable", () => {
      for (const endpointUrl of [null, "", "   "]) {
        const reader = subscriber({ endpointUrl });
        expect(reader.endpointUrl).toBeNull();
        expect(reader.isDeliverable).toBe(false);
        expect(reader.toPersistence().endpointUrl).toBeNull();
        expect(() => reader.assertHasEndpoint()).toThrow(VitrineSubscriberReadOnlyError);
      }
    });

    it("se réhydrate sans adresse, et reste non livrable même rallumé et resynchronisé", () => {
      const reader = VitrineSubscriber.rehydrate(subscriber({ endpointUrl: null }).toPersistence());
      reader.setActive(false, LATER);
      reader.setActive(true, LATER);
      reader.resynchronize(LATER);
      expect(reader.endpointUrl).toBeNull();
      expect(reader.isDeliverable).toBe(false);
    });

    it("une adresse fournie garde ses gardes : http:// reste refusé", () => {
      expect(() => subscriber({ endpointUrl: "http://agence.example/hook" })).toThrow(
        VitrineEndpointNotHttpsError,
      );
    });

    it("avec une adresse, l'essai est admis", () => {
      expect(() => subscriber().assertHasEndpoint()).not.toThrow();
    });
  });
});
