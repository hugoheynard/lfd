/**
 * Scène partagée par les suites `collection-test-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E du **prélèvement d'essai** et de **nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : le droit `collection_test`
 * (403 sans lui), la déclaration relue en base, le refus d'une société non
 * déclarée, le plafond de 1 € et `FNAL` inexprimable à la porte, `OOFF` refusé
 * sur un mandat ponctuel qu'un lot porte, le fichier gardé et VALIDE au XSD
 * officiel, des références `ESS-` de 35 caractères au plus, le retour bancaire
 * `ESS-` rattaché à son essai — et AUCUNE facture, aucun bon, aucun lot, aucun
 * état d'encaissement touché.
 *
 * ⚠️ Mandats et lot écrits par Prisma : même dette que
 * `collection-batch-scene.ts`. L'horloge est celle du test (`FixedClock`,
 * posée à maintenant) : l'échéance est relue dans la proposition du serveur,
 * jamais écrite en dur.
 */
import type { CollectionTestDebtorsView } from "@lfd/contracts";
import { sha256Of } from "../src/b2b/accounting/domain/services/collection-batch-file.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { E2E_STAFF_ID, bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ENTITIES = "/admin/accounting/legal-entities";
export const ESTABLISHMENTS = "/admin/accounting/own-establishments";
export const TESTS = "/admin/accounting/collection-tests";
export const RETURNS = "/admin/accounting/collection-returns";
export const SEPA_MAX = 35;
export const DEBTOR_IBAN = "FR7630004000031234567890143";
export const RIB = {
  iban: DEBTOR_IBAN,
  bic: "BNPAFRPP",
  holder: "Folie Douce Val",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
/** Le comptable de la graine : `b2b_accounting`, mais pas `collection_test`. */
export const ACCOUNTANT = { sub: "staff-comptable", id: "fiche-comptable" } as const;

export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Signé il y a deux mois — comparé seulement à sa cellule F. */
export const SIGNED_AT = daysAgo(60);
export const clock = new FixedClock(new Date());
export let ctx: E2eContext;
export let seq = 0;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

export async function entity(): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
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
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR1420041010050500013M02606", bic: "CEPAFRPP751" })
    .expect(204);
  return id;
}

/** Une société active, son RIB, un mandat actif chez l'entité. */
export async function ourCompany(
  entityId: string,
  paymentType: "recurrent" | "one_off" = "recurrent",
): Promise<{ companyId: string; mandateId: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: "Folie Douce Val" });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-ESS-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(SIGNED_AT),
      scheme: "B2B",
      paymentType,
    },
  });
  return { companyId: company.id, mandateId: mandate.id };
}

export async function declare(companyId: string): Promise<void> {
  await staff().post(ESTABLISHMENTS).send({ companyId }).expect(204);
}

export async function proposedDay(): Promise<string> {
  const view = jsonBody<CollectionTestDebtorsView>(
    await staff().get(`${TESTS}/debtors`).expect(200),
  );
  const day = view.debtors[0]?.earliestCollectionDay;
  if (day === null || day === undefined) {
    throw new Error(`aucune échéance proposée : ${JSON.stringify(view.debtors)}`);
  }
  return day;
}

export function generate(companyId: string, body: Record<string, unknown>) {
  return staff()
    .post(TESTS)
    .send({ companyId, amountCents: 100, sequence: "RCUR", remittance: null, ...body });
}

/** Les tables qu'un essai ne doit JAMAIS toucher. */
export async function moneyTables(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.invoice.count(),
    ctx.prisma.order.count(),
    ctx.prisma.collectionBatch.count(),
    ctx.prisma.collectionBatchLine.count(),
    ctx.prisma.orderCollection.count(),
    ctx.prisma.collectionReturn.count(),
    ctx.prisma.collectionNotice.count(),
    ctx.prisma.billingStatement.count(),
  ]);
}

/**
 * Un lot CONSTITUÉ dont la ligne porte ce mandat. Écrit par Prisma (même dette
 * que `collection-batch-scene.ts`) : la constitution réelle demande un
 * cycle de commandes entier, et seule la présence de la ligne compte ici.
 */
export async function batchCarrying(
  entityId: string,
  companyId: string,
  mandateId: string,
): Promise<void> {
  const now = new Date();
  await ctx.prisma.collectionBatch.create({
    data: {
      id: "01JBQ7Z5K8M3QT9P2X4BLOT000",
      legalEntityId: entityId,
      scheme: "B2B",
      cycleStartsAt: new Date(now.getTime() - 30 * DAY_MS),
      cycleClosesAt: now,
      status: "constituted",
      constitutedAt: now,
      constitutedByStaffId: E2E_STAFF_ID,
      xml: "<Document/>",
      fileSha256: sha256Of("<Document/>"),
      lines: {
        create: {
          rank: 1,
          endToEndId: "01JBQ7Z5K8M3QT9P2X4BLOT000-0001",
          mandateId,
          mandateReference: "RUM-LOT",
          mandateSignedAt: now,
          debtorCompanyId: companyId,
          debtorName: "Folie Douce Val",
          debtorIbanSealed: "scelle",
          debtorIbanLast4: "0143",
          sequence: "OOFF",
          amountCents: 1_000,
          orderCount: 1,
          priorOrderCount: 0,
        },
      },
    },
  });
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useCollectionTestScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: Clock, value: clock },
      ],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    clock.set(new Date());
  });
}
