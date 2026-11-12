import type { FulfillmentPreferenceView } from "@lfd/contracts";

import { ContactDetails } from "../../value-objects/contact-details.js";
import { KbisDeposit } from "../../value-objects/kbis-deposit.js";
import { Company } from "../company.js";

/**
 * Rejouer un geste qui ne change rien : l'agrégat le dit (`false`), et le
 * handler sort sans écrire ni journaliser. Chaque cas vérifie aussi qu'UNE
 * seule valeur différente suffit à faire un changement — un « inchangé » qui
 * avalerait une vraie saisie serait pire que le rejeu.
 *
 * Les dates sont absolues légitimement : comparées à aucune horloge.
 */

const CONTACT = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@pqmarais.fr",
  phone: "06 11 22 33 44",
};

const UPLOADED_AT = new Date("2026-03-01T08:00:00.000Z");

function company(
  input: {
    grantedTerms?: Company["grantedTerms"];
    requestedTerm?: Company["requestedTerm"];
    kbis?: KbisDeposit | null;
    preference?: FulfillmentPreferenceView;
  } = {},
): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "FR32812456789",
    contact: ContactDetails.create(CONTACT),
    grantedTerms: input.grantedTerms ?? [],
    requestedTerm: input.requestedTerm ?? null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    kbis: input.kbis ?? null,
    ...(input.preference === undefined ? {} : { fulfillmentPreference: input.preference }),
  });
}

describe("Company — un geste déjà dans cet état est inchangé", () => {
  // Régression : rejouer « modifier le détenteur » réécrivait et journalisait à chaque appel.
  it("changePrimaryContact : mêmes coordonnées → inchangé ; seul le téléphone change → changé", () => {
    const target = company();
    expect(target.changePrimaryContact(ContactDetails.create({ ...CONTACT }))).toBe(false);
    expect(
      target.changePrimaryContact(ContactDetails.create({ ...CONTACT, phone: "06 99 88 77 66" })),
    ).toBe(true);
    expect(target.contact?.phone.value).not.toBe(ContactDetails.create(CONTACT).phone.value);
  });

  it("changePrimaryContact : seule la fonction change → changé", () => {
    expect(
      company().changePrimaryContact(ContactDetails.create({ ...CONTACT, fonction: "Achats" })),
    ).toBe(true);
  });

  it("grantTerms : mêmes crédits sans demande en cours → inchangé, doublons compris", () => {
    const target = company({ grantedTerms: ["monthly"] });
    expect(target.grantTerms(["monthly", "monthly"])).toBe(false);
    expect(target.grantTerms([])).toBe(true);
  });

  it("grantTerms : mêmes crédits mais une demande attend → changé (la demande est soldée)", () => {
    const target = company({ grantedTerms: [], requestedTerm: "monthly" });
    expect(target.grantTerms([])).toBe(true);
    expect(target.requestedTerm).toBeNull();
  });

  it("requestTerm : la même demande → inchangé ; la retirer → changé", () => {
    const target = company({ requestedTerm: "monthly" });
    expect(target.requestTerm("monthly")).toBe(false);
    expect(target.requestTerm(null)).toBe(true);
  });

  it("preferFulfillment : même préférence → inchangé ; seul le socle de signature change → changé", () => {
    const preference: FulfillmentPreferenceView = {
      method: "pickup",
      pickupAddressId: "p1",
      deliveryAddressId: null,
      signatureRequired: false,
    };
    const target = company({ preference });
    expect(target.preferFulfillment({ ...preference })).toBe(false);
    expect(target.preferFulfillment({ ...preference, signatureRequired: true })).toBe(true);
  });

  it("revokeKbisCertification : rien de certifié (ou pas d'extrait) → inchangé", () => {
    const deposit = KbisDeposit.deposit({
      storageKey: "k",
      fileName: "kbis.pdf",
      contentType: "application/pdf",
      size: 1,
      uploadedAt: UPLOADED_AT,
    });
    expect(company().revokeKbisCertification()).toBe(false);
    expect(company({ kbis: deposit }).revokeKbisCertification()).toBe(false);
    const certified = deposit.certify({
      at: new Date("2026-03-02T08:00:00.000Z"),
      byStaffUserId: "staff_1",
      byName: "",
      byRole: "",
      issuedOn: "2026-02-20",
    });
    expect(company({ kbis: certified }).revokeKbisCertification()).toBe(true);
  });

  it("correctIdentity : la même identité (formes différentes) → inchangé ; une enseigne → changé", () => {
    const same = {
      raisonSociale: "",
      formeJuridique: "",
      siret: "",
      siren: "",
      enseigne: "  Marais   Café ",
      vatNumber: "fr32 812 456 789",
    };
    const target = company();
    expect(target.correctIdentity(same)).toBe(false);
    expect(target.correctIdentity({ ...same, enseigne: "Autre" })).toBe(true);
  });
});
