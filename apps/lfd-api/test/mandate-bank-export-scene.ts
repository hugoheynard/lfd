/**
 * Scène partagée par les suites `mandate-bank-export-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E de l'**export des mandats pour la banque** (plan
 * `documentation/comptabilite/mandat/export-des-mandats-pour-la-banque.md`).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : les octets du fichier
 * (CRLF, `;` final, sans en-tête), l'IBAN descellé du vrai `FieldCipher`, la
 * sélection par empreinte relue en base après « Marquer importé », le droit
 * d'écriture sur un `GET`, le mur de l'entité dans la requête, et un journal
 * sans IBAN.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `collection-batch-scene.ts`.
 * Aucune date absolue : la signature est relative à maintenant, et la cellule
 * F se calcule par la fonction du domaine sur la MÊME constante.
 */
import type { MandateBankExportCreatedView } from "@lfd/contracts";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

export const ICS = "FR72ZZZ123456";
/** Un ICS ne sert qu'une entité : la seconde a le sien. */
export const OTHER_ICS = "FR19ZZZ654321";
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

export function exportsOf(entityId: string): string {
  return `/admin/accounting/legal-entities/${entityId}/mandate-exports`;
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
/**
 * `withoutBic` : un RIB recopié AVANT que le BIC soit exigé — la route le
 * refuse aujourd'hui, la base en garde (`bic = ""`).
 */
export async function mandated(
  entityId: string,
  name: string,
  withoutBic = false,
): Promise<string> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  if (withoutBic) {
    await ctx.prisma.companyBankAccount.updateMany({
      where: { companyId: company.id },
      data: { bic: "" },
    });
  }
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

export async function prepare(entityId: string): Promise<string> {
  const response = await staff().post(exportsOf(entityId)).send({}).expect(201);
  return jsonBody<MandateBankExportCreatedView>(response).exportId;
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useMandateBankExportScene(): void {
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
