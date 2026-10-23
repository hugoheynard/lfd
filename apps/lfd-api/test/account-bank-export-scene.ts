/**
 * Scène partagée par les suites `account-bank-export-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E de l'**export des comptes destinataires pour la banque** (doc
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md`).
 *
 * Ce que seuls le vrai SQL et le vrai HTTP prouvent : les octets du fichier
 * (16 colonnes, `;` sans terminateur, CRLF, sans en-tête, IBAN découpé),
 * l'IBAN descellé du vrai `FieldCipher`, « nouveaux seulement » relu en base
 * (en vol, importé, déjà connu), le droit d'écriture sur un `GET`, et un
 * journal qui compte chaque téléchargement sans jamais porter d'IBAN.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `mandate-bank-export-scene.ts`.
 * Aucune date comparée à l'horloge.
 */
import type { AccountBankExportCreatedView, AccountBankExportsView } from "@lfd/contracts";
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
export const OTHER_IBAN = "DE89370400440532013000";

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
  return `/admin/accounting/legal-entities/${entityId}/account-exports`;
}

export async function entity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
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
    .send({ ics: ICS })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Un IBAN français VALIDE et distinct par numéro : la clé se calcule (mod 97). */
export function frenchIban(n: number): string {
  const bban = `30004000${String(n).padStart(13, "0")}00`;
  const digits = `${bban}152700`; // « FR00 » : F=15, R=27
  let rest = 0;
  for (const digit of digits) {
    rest = (rest * 10 + Number(digit)) % 97;
  }
  return `FR${String(98 - rest).padStart(2, "0")}${bban}`;
}

export interface Debtor {
  readonly bankAccountId: string;
}

/** Une société avec son RIB, et un mandat actif chez l'entité. */
export async function debtor(
  entityId: string,
  name: string,
  iban = DEBTOR_IBAN,
  withoutBic = false,
  enseigne = "",
): Promise<Debtor> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name, enseigne });
  await staff()
    .put(`/admin/companies/${company.id}/bank-account`)
    .send({
      iban,
      bic: "BNPAFRPP",
      holder: `${name} titulaire`,
      line1: "1 rue du Test",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
  if (withoutBic) {
    await ctx.prisma.companyBankAccount.updateMany({
      where: { companyId: company.id },
      data: { bic: "" },
    });
  }
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-ACC-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(daysAgo(30)),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
    where: { companyId: company.id },
    select: { id: true },
  });
  return { bankAccountId: account.id };
}

export async function prepare(entityId: string): Promise<string> {
  const response = await staff().post(exportsOf(entityId)).expect(201);
  return jsonBody<AccountBankExportCreatedView>(response).exportId;
}

export async function card(entityId: string): Promise<AccountBankExportsView> {
  return jsonBody<AccountBankExportsView>(await staff().get(exportsOf(entityId)).expect(200));
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useAccountBankExportScene(): void {
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
