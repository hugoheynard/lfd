import type { PlatformSettings } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../../ports/admin-company.reader.js";
import { activationGate } from "../activation-gate.js";

/** Fiche de base : assujettie TVA, joignable, aucune pièce présente. */
function detail(over: Partial<AdminCompanyDetailView> = {}): AdminCompanyDetailView {
  return {
    id: "company_1",
    reference: "C-1",
    raisonSociale: "Café",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "12345678901234",
    tvaIntracom: "",
    status: "pending",
    grantedTerms: [],
    requestedTerm: null,
    primaryContact: {
      id: null,
      firstName: "L",
      lastName: "M",
      fonction: "",
      email: "l@m.fr",
      phone: "01 42 71 08 44",
    },
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: "2026-07-30T10:00:00.000Z",
    vatNumberRequired: true,
    addresses: { billing: null, deliveries: [] },
    activation: null,
    suspensionCause: null,
    contacts: [],
    fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
    ...over,
  };
}

const ALL_REQUIRED: PlatformSettings = {
  tva: "required",
  kbis: "required",
  billing: "required",
  delivery: "required",
};

/** Un dossier complet — on retire ensuite ce qu'on veut éprouver. */
const COMPLETE: Partial<AdminCompanyDetailView> = {
  tvaIntracom: "FR32812456789",
  kbis: {
    fileName: "k.pdf",
    uploadedAt: "2026-08-01T10:00:00.000Z",
    certified: true,
    certifiedAt: "2026-08-02T10:00:00.000Z",
    certifiedBy: { sub: "auth0|s", name: "Camille", role: "commercial" },
  },
  addresses: {
    billing: {
      id: "addr_b",
      label: "Siège",
      ligne1: "18 rue des Archives",
      ligne2: "",
      codePostal: "75004",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    deliveries: [
      {
        id: "addr_d",
        label: "Boutique",
        ligne1: "3 rue Oberkampf",
        ligne2: "",
        codePostal: "75011",
        ville: "Paris",
        pays: "France",
        isDefault: true,
      },
    ],
  },
};

describe("activationGate — le verdict, et il n'y en a qu'un", () => {
  it("dit ce qui bloque, pièce par pièce", () => {
    expect(activationGate(detail(), ALL_REQUIRED).blocking).toEqual([
      "tva",
      "kbis_absent",
      "facturation",
      "livraison",
    ]);
  });

  it("ouvre la porte quand tout est réuni", () => {
    const gate = activationGate(detail(COMPLETE), ALL_REQUIRED);
    expect(gate.blocking).toEqual([]);
    expect(gate.canActivate).toBe(true);
  });

  it("distingue le KBIS ABSENT du KBIS non vérifié", () => {
    // Deux manques, deux gestes : déposer un extrait, ou ouvrir celui qui dort
    // déjà là. Les confondre laisse chercher un fichier qui est sous les yeux.
    const deposited = {
      ...COMPLETE,
      kbis: {
        fileName: "k.pdf",
        uploadedAt: "2026-08-01T10:00:00.000Z",
        certified: false,
        certifiedAt: null,
        certifiedBy: null,
      },
    };
    expect(activationGate(detail(deposited), ALL_REQUIRED).blocking).toEqual(["kbis_non_verifie"]);
  });

  it("n'exige pas une pièce seulement `optional`", () => {
    const settings: PlatformSettings = { ...ALL_REQUIRED, billing: "optional", tva: "hidden" };
    const gate = activationGate(detail({ ...COMPLETE, tvaIntracom: "" }), settings);
    expect(gate.blocking).toEqual([]);
    // Elle reste dans la liste : « pas bloquante » n'est pas « pas demandée ».
    expect(gate.checklist.find((check) => check.piece === "billing")?.mode).toBe("optional");
  });

  it("ne réclame pas de TVA à un non-assujetti", () => {
    const gate = activationGate(detail({ ...COMPLETE, vatNumberRequired: false }), ALL_REQUIRED);
    expect(gate.blocking).toEqual([]);
  });

  it("refuse un compte qu'on ne peut appeler, dossier complet ou non", () => {
    // Un livreur devant une porte fermée sans numéro à composer, c'est une
    // commande qui repart au dépôt.
    const mute = detail({
      ...COMPLETE,
      primaryContact: {
        id: null,
        firstName: "L",
        lastName: "M",
        fonction: "",
        email: "l@m.fr",
        phone: "",
      },
    });
    expect(activationGate(mute, ALL_REQUIRED).blocking).toEqual(["telephone"]);
  });

  it("accepte le numéro d'un interlocuteur, pas seulement du détenteur", () => {
    const viaContact = detail({
      ...COMPLETE,
      primaryContact: {
        id: null,
        firstName: "L",
        lastName: "M",
        fonction: "",
        email: "l@m.fr",
        phone: "",
      },
      contacts: [
        {
          contactId: "ct_1",
          role: "manager",
          firstName: "R",
          lastName: "P",
          fonction: "réception",
          email: "r@p.fr",
          phone: "06 12 34 56 78",
          access: "none",
        },
      ],
    });
    expect(activationGate(viaContact, ALL_REQUIRED).blocking).toEqual([]);
  });

  it("exige l'identité légale, qu'aucun réglage ne désactive", () => {
    // Sans SIRET, il n'y a rien à facturer — ce n'est pas une pièce configurable.
    const sansSiret = detail({ ...COMPLETE, siret: "" });
    expect(activationGate(sansSiret, ALL_REQUIRED).blocking).toEqual(["identite_legale"]);
  });

  it("exige un DÉTENTEUR, même sur un dossier complet par ailleurs", () => {
    // Un compte s'ouvre sur sa seule enseigne ; il ne devient pas client sans
    // personne à qui ouvrir l'espace. Activer ici fabriquerait un compte actif
    // dont la porte est murée.
    const sansDetenteur = detail({
      ...COMPLETE,
      primaryContact: { id: null, firstName: "", lastName: "", fonction: "", email: "", phone: "" },
      contacts: [
        {
          contactId: "ct_1",
          role: "manager",
          firstName: "R",
          lastName: "P",
          fonction: "réception",
          email: "r@p.fr",
          // Un numéro joignable : c'est bien le DÉTENTEUR qui manque, pas le
          // téléphone — les deux empêchements ne se recouvrent pas.
          phone: "06 12 34 56 78",
          access: "none",
        },
      ],
    });

    expect(activationGate(sansDetenteur, ALL_REQUIRED).blocking).toEqual(["detenteur"]);
  });

  it("n'ouvre la porte QUE sur un compte en attente", () => {
    // Un compte actif, suspendu ou résilié ne s'active pas : allumer le bouton
    // promettrait ce que l'agrégat refuse.
    const actif = activationGate(detail({ ...COMPLETE, status: "active" }), ALL_REQUIRED);
    expect(actif.blocking).toEqual([]);
    expect(actif.canActivate).toBe(false);
  });
});
