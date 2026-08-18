import type { DeliveryContact, FulfillmentWindow, PickupOpening } from "@lfd/contracts";

import {
  agreeFulfillment,
  type FulfillmentDefaults,
  windowFitsPickup,
} from "../agreed-fulfillment.js";

const CONTACT: DeliveryContact = { prenom: "Léa", nom: "Martin", telephone: "0600000000" };
const MORNING: FulfillmentWindow = { start: "06:00", end: "08:00" };

const NOTHING: FulfillmentDefaults = { contact: null, signatureRequired: false, window: null };

describe("l'acheminement convenu", () => {
  it("dit `default` quand la valeur est celle du réglage", () => {
    const agreed = agreeFulfillment(
      { contact: CONTACT, signatureRequired: true, window: MORNING },
      { contact: CONTACT, signatureRequired: true, window: MORNING },
    );

    expect(agreed.contact.source).toBe("default");
    expect(agreed.signatureRequired.source).toBe("default");
    expect(agreed.window.source).toBe("default");
  });

  it("compare le contact par VALEUR, pas par identité", () => {
    // Le front reconstruit ses objets à chaque rendu : comparer les références
    // ferait passer tout préremplissage pour une décision du client.
    const agreed = agreeFulfillment(
      { contact: { ...CONTACT }, signatureRequired: false, window: null },
      { ...NOTHING, contact: CONTACT },
    );

    expect(agreed.contact.source).toBe("default");
  });

  it("dit `override` dès qu'un seul champ du contact change", () => {
    const agreed = agreeFulfillment(
      { contact: { ...CONTACT, telephone: "0611111111" }, signatureRequired: false, window: null },
      { ...NOTHING, contact: CONTACT },
    );

    expect(agreed.contact.source).toBe("override");
    expect(agreed.contact.value?.telephone).toBe("0611111111");
  });

  it("dit `override` quand on RETIRE ce que le réglage proposait", () => {
    // Enlever la signature qu'un compte exige est une décision, pas une absence.
    const agreed = agreeFulfillment(
      { contact: null, signatureRequired: false, window: null },
      { contact: CONTACT, signatureRequired: true, window: MORNING },
    );

    expect(agreed.contact.source).toBe("override");
    expect(agreed.signatureRequired.source).toBe("override");
    expect(agreed.window.source).toBe("override");
  });

  it("dit `default` quand il n'y avait aucun réglage et que rien n'est demandé", () => {
    const agreed = agreeFulfillment(
      { contact: null, signatureRequired: false, window: null },
      NOTHING,
    );

    expect(agreed.contact.source).toBe("default");
    expect(agreed.window.value).toBeNull();
  });
});

describe("la tranche demandée face aux heures du point", () => {
  const OPENING: PickupOpening = {
    proPickup: { start: "05:00", end: "06:30" },
    publicOpening: { start: "07:00", end: "20:00" },
  };

  it("accepte une tranche contenue dans le créneau pro", () => {
    expect(windowFitsPickup({ start: "05:15", end: "06:00" }, OPENING)).toBe(true);
  });

  it("accepte une tranche contenue dans l'ouverture publique", () => {
    expect(windowFitsPickup({ start: "09:00", end: "10:00" }, OPENING)).toBe(true);
  });

  it("REFUSE une tranche qui enjambe le trou entre les deux fenêtres", () => {
    // 6h–7h30 tient dans l'UNION des deux, mais dans aucune des deux : entre
    // 6h30 et 7h la porte est close. C'est tout l'intérêt de ne pas les aplatir.
    expect(windowFitsPickup({ start: "06:00", end: "07:30" }, OPENING)).toBe(false);
  });

  it("refuse une tranche entièrement dans le trou", () => {
    expect(windowFitsPickup({ start: "06:35", end: "06:50" }, OPENING)).toBe(false);
  });

  it("accepte tout quand le point n'a AUCUNE heure déclarée", () => {
    // On ne refuse pas une commande parce qu'un réglage n'a pas été rempli :
    // c'est à l'écran de réglages de le signaler, pas au client de le subir.
    expect(windowFitsPickup(MORNING, { proPickup: null, publicOpening: null })).toBe(true);
  });

  it("n'a rien à vérifier quand aucune tranche n'est demandée", () => {
    expect(windowFitsPickup(null, OPENING)).toBe(true);
  });

  it("traite une borne basse absente comme « dès l'ouverture »", () => {
    // « avant 6h » dans un créneau qui ouvre à 5h : recevable.
    expect(windowFitsPickup({ start: null, end: "06:00" }, OPENING)).toBe(true);
    // « avant 21h » déborde la fermeture : non.
    expect(windowFitsPickup({ start: null, end: "21:00" }, OPENING)).toBe(false);
  });
});
