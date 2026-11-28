import type { AdminCompanyDetailView, AdminCompanyView } from "@lfd/contracts";

import { AdminCompanyReader } from "../../../domain/ports/admin-company.reader.js";

const BILLING = {
  id: "addr_billing",
  label: "Siège",
  ligne1: "3 quai des Brumes",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "FR",
};

/**
 * La fiche d'un compte ouvert au comptoir, telle que le verdict d'activation
 * la lit : par défaut complète (identité légale, TVA non exigée, adresse de
 * facturation, téléphone) — chaque spec retire ce qu'elle veut voir manquer.
 */
export function counterFiche(
  id: string,
  overrides: Partial<AdminCompanyDetailView> = {},
): AdminCompanyDetailView {
  return {
    id,
    revision: 0,
    owner: null,
    warnings: [],
    reference: "C-000777",
    raisonSociale: "Kiosque du Quai SAS",
    enseigne: "Kiosque du Quai",
    formeJuridique: "SAS",
    siret: "81245678900021",
    siren: "812456789",
    vatNumber: "",
    status: "counter_opened",
    grantedTerms: ["monthly"],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      role: null,
      id: null,
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "",
      email: "camille@kiosque.test",
      phone: "0612345678",
    },
    kbis: null,
    hasOpenSupportRequest: false,
    parent: null,
    hierarchy: {
      parent: null,
      subAccounts: [],
      follows: [],
      groupWithoutDelivery: false,
      collectionForm: null,
    },
    activatedAt: null,
    createdAt: "2026-07-30T10:00:00.000Z",
    declaredVia: "staff",
    piecesReached: [],
    vatNumberRequired: false,
    archivedAt: null,
    archivedByName: null,
    archiveReason: null,
    hasBankAccount: false,
    addresses: { billing: BILLING, deliveries: [] },
    activation: null,
    suspensionCause: null,
    contacts: [],
    chorusService: null,
    chorusServicePayerIsPublic: false,
    payerSettlesOnAccount: true,
    chorusRouting: null,
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    ...overrides,
  };
}

/** Lecteur de fiches doublé : rend celles qu'on lui donne, compte ses lectures. */
export class FixedFiches extends AdminCompanyReader {
  readonly readIds: string[] = [];
  constructor(private readonly fiches: ReadonlyMap<string, AdminCompanyDetailView>) {
    super();
  }
  listAll(): Promise<readonly AdminCompanyView[]> {
    return Promise.resolve([]);
  }
  byId(companyId: string): Promise<AdminCompanyDetailView | null> {
    this.readIds.push(companyId);
    return Promise.resolve(this.fiches.get(companyId) ?? null);
  }
}
