/**
 * Scène partagée par les suites `collection-procedure-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E de la **lecture d'état de la procédure de prélèvement** (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * S1, lot P2).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : l'état des onglets 1 et 2
 * relu en base après chaque geste des cartes — sans rien stocker —, la lecture
 * sous `b2b_accounting` seule, et le 404 d'un lot que l'entité n'a pas.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `mandate-bank-export-scene.ts`,
 * dont la mise en place est reprise. Aucune date absolue.
 */
import type { CollectionProcedureView } from "@lfd/contracts";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

export const ICS = "FR72ZZZ123456";
export const ACCOUNT = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
export const DEBTOR_IBAN = "FR7630004000031234567890143";
export const DEBTOR_RIB = {
  iban: DEBTOR_IBAN,
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
/** Signé il y a deux mois — comparé à rien d'autre qu'à sa cellule F. */
export const SIGNED_AT = daysAgo(60);

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

export let ctx: E2eContext;
export let seq = 0;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

export function procedureOf(entityId: string, batchId?: string): string {
  const lot = batchId === undefined ? "" : `&batchId=${batchId}`;
  return `/admin/accounting/collection-procedure?legalEntityId=${entityId}${lot}`;
}

export function exportsOf(entityId: string, kind: "account" | "mandate"): string {
  return `/admin/accounting/legal-entities/${entityId}/${kind}-exports`;
}

export async function procedure(entityId: string): Promise<CollectionProcedureView> {
  return jsonBody<CollectionProcedureView>(await staff().get(procedureOf(entityId)).expect(200));
}

export async function entity(siren: string, ics = ICS): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren,
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Une société avec son RIB, et un mandat actif chez l'entité. */
export async function mandated(entityId: string, name: string): Promise<string> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-EXP-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(SIGNED_AT),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return mandate.reference;
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useCollectionProcedureScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });
}
