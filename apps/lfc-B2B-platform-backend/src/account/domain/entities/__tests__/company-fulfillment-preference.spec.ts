import { NO_FULFILLMENT_PREFERENCE } from "@lfd/contracts";

import { ContactDetails } from "../../value-objects/contact-details.js";
import { Company } from "../company.js";

function sampleCompany(): Company {
  return Company.reconstitute({
    id: "cmp_1",
    raisonSociale: "Café des Halles SAS",
    enseigne: "Le Comptoir",
    formeJuridique: "SAS",
    siret: "81245678900021",
    tvaIntracom: "",
    contact: ContactDetails.create({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@halles.fr",
      phone: "0600000000",
    }),
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    nafCode: "",
  });
}

describe("Company — préférence d'acheminement", () => {
  it("n'en a AUCUNE tant qu'on n'en a pas posé", () => {
    // « Pas encore réglé » n'est pas « retrait » : c'est l'état de tout le
    // portefeuille existant, et l'écran doit pouvoir le dire.
    expect(sampleCompany().fulfillmentPreference).toEqual(NO_FULFILLMENT_PREFERENCE);
  });

  it("retient le point de retrait choisi", () => {
    const company = sampleCompany();

    company.preferFulfillment({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: null,
    });

    expect(company.fulfillmentPreference).toEqual({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: null,
    });
  });

  it("EFFACE le pointeur qui ne concerne pas la méthode choisie", () => {
    // Garder l'adresse de livraison d'un client passé au retrait la ferait
    // ressurgir des mois plus tard, au moment où quelqu'un rebasculerait la
    // méthode — avec une adresse que plus personne n'a validée entre-temps.
    const company = sampleCompany();

    company.preferFulfillment({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: "addr_ancienne",
    });

    expect(company.fulfillmentPreference.deliveryAddressId).toBeNull();
  });

  it("oublie le point de retrait quand on repasse en livraison", () => {
    const company = sampleCompany();
    company.preferFulfillment({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: null,
    });

    company.preferFulfillment({
      method: "delivery",
      pickupAddressId: "pick_labo",
      deliveryAddressId: "addr_1",
    });

    expect(company.fulfillmentPreference).toEqual({
      method: "delivery",
      pickupAddressId: null,
      deliveryAddressId: "addr_1",
    });
  });

  it("accepte une méthode SANS pointeur — « le défaut du moment »", () => {
    // Pointer explicitement sur l'adresse par défaut la figerait : le jour où
    // elle change, la préférence désignerait encore l'ancienne.
    const company = sampleCompany();

    company.preferFulfillment({
      method: "delivery",
      pickupAddressId: null,
      deliveryAddressId: null,
    });

    expect(company.fulfillmentPreference.method).toBe("delivery");
    expect(company.fulfillmentPreference.deliveryAddressId).toBeNull();
  });

  it("sérialise la préférence pour la persistance", () => {
    const company = sampleCompany();
    company.preferFulfillment({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: null,
    });

    expect(company.toPersistence().fulfillmentPreference).toEqual({
      method: "pickup",
      pickupAddressId: "pick_labo",
      deliveryAddressId: null,
    });
  });
});
