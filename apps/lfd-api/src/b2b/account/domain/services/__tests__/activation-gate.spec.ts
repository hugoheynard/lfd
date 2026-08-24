import type { AdminCompanyDetailView } from "../../ports/admin-company.reader.js";
import { activationGate } from "../activation-gate.js";

/** Fiche de base : assujettie TVA, joignable, aucune pièce présente. */
function detail(over: Partial<AdminCompanyDetailView> = {}): AdminCompanyDetailView {
  return {
    id: "company_1",
    owner: null,
    warnings: [],
    reference: "C-1",
    raisonSociale: "Café",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "12345678901234",
    vatNumber: "",
    status: "pending",
    grantedTerms: [],
    requestedTerm: null,
    primaryContact: {
      role: null,
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

/** Un dossier complet — on retire ensuite ce qu'on veut éprouver. */
const COMPLETE: Partial<AdminCompanyDetailView> = {
  vatNumber: "FR32812456789",
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
    },
    deliveries: [
      {
        specs: {
          note: "",
          slots: { mode: "everyday", slot: null },
          deliveryContact: null,
          gps: null,
          signatureRequired: false,
        },
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
    // Ni le KBIS ni la livraison : le premier est une convention interne, la
    // seconde un service qui n'existe pas.
    expect(activationGate(detail()).blocking).toEqual(["vat", "facturation"]);
  });

  it("ouvre la porte quand tout est réuni", () => {
    const gate = activationGate(detail(COMPLETE));
    expect(gate.blocking).toEqual([]);
    expect(gate.canActivate).toBe(true);
  });

  it("laisse passer un KBIS déposé mais pas vérifié — et le dit non fait", () => {
    // La vérification est une CONVENTION INTERNE : on veut voir l'extrait, on
    // ne veut pas perdre la commande de demain matin pour un PDF. Elle reste
    // dite « non faite » — c'est le signal qui la réclame, pas la porte.
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
    const gate = activationGate(detail(deposited));
    expect(gate.blocking).toEqual([]);
    expect(gate.canActivate).toBe(true);
    expect(gate.checklist.find((check) => check.piece === "kbis")?.done).toBe(false);
  });

  it("réclame le KBIS sans le rendre bloquant", () => {
    // « Pas bloquante » n'est pas « pas demandée » : la pièce reste dans la
    // liste, avec son état, et c'est ce qui la fait remonter au staff.
    const kbis = activationGate(detail()).checklist.find((check) => check.piece === "kbis");
    expect(kbis).toBeDefined();
    expect(kbis?.blocking).toBe(false);
  });

  it("ne demande PLUS la livraison, tant que le service n'existe pas", () => {
    const pieces = activationGate(detail()).checklist.map((check) => check.piece);
    expect(pieces).toEqual(["vat", "kbis", "billing"]);
  });

  it("ne réclame pas de TVA à un non-assujetti", () => {
    const gate = activationGate(detail({ ...COMPLETE, vatNumberRequired: false }));
    expect(gate.blocking).toEqual([]);
  });

  it("refuse un compte qu'on ne peut appeler, dossier complet ou non", () => {
    // Un livreur devant une porte fermée sans numéro à composer, c'est une
    // commande qui repart au dépôt.
    const mute = detail({
      ...COMPLETE,
      primaryContact: {
        role: null,
        id: null,
        firstName: "L",
        lastName: "M",
        fonction: "",
        email: "l@m.fr",
        phone: "",
      },
    });
    expect(activationGate(mute).blocking).toEqual(["telephone"]);
  });

  it("accepte le numéro d'un interlocuteur, pas seulement du détenteur", () => {
    const viaContact = detail({
      ...COMPLETE,
      primaryContact: {
        role: null,
        id: null,
        firstName: "L",
        lastName: "M",
        fonction: "",
        email: "l@m.fr",
        phone: "",
      },
      contacts: [
        {
          emailVerified: false,
          contactId: "ct_1",
          role: "admin",
          firstName: "R",
          lastName: "P",
          fonction: "réception",
          email: "r@p.fr",
          phone: "06 12 34 56 78",
          access: "none",
        },
      ],
    });
    expect(activationGate(viaContact).blocking).toEqual([]);
  });

  it("exige l'identité légale", () => {
    // Sans SIRET, il n'y a rien à facturer.
    const sansSiret = detail({ ...COMPLETE, siret: "" });
    expect(activationGate(sansSiret).blocking).toEqual(["identite_legale"]);
  });

  it("exige un DÉTENTEUR, même sur un dossier complet par ailleurs", () => {
    // Un compte s'ouvre sur sa seule enseigne ; il ne devient pas client sans
    // personne à qui ouvrir l'espace. Activer ici fabriquerait un compte actif
    // dont la porte est murée.
    const sansDetenteur = detail({
      ...COMPLETE,
      primaryContact: {
        role: null,
        id: null,
        firstName: "",
        lastName: "",
        fonction: "",
        email: "",
        phone: "",
      },
      contacts: [
        {
          emailVerified: false,
          contactId: "ct_1",
          role: "admin",
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

    expect(activationGate(sansDetenteur).blocking).toEqual(["detenteur"]);
  });

  it("n'ouvre la porte QUE sur un compte en attente", () => {
    // Un compte actif, suspendu ou résilié ne s'active pas : allumer le bouton
    // promettrait ce que l'agrégat refuse.
    const actif = activationGate(detail({ ...COMPLETE, status: "active" }));
    expect(actif.blocking).toEqual([]);
    expect(actif.canActivate).toBe(false);
  });
});
