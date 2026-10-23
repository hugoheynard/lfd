/**
 * Scène partagée par les suites `collection-notice-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E de l'**avis de prélèvement** (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA2).
 *
 * Ce que seul le vrai SQL prouve : l'avis et son fait de boîte d'envoi sont
 * écrits dans la transaction du lot, avec le montant de l'arrêté, l'échéance
 * du lot et le bon destinataire ; le dépôt est refusé tant qu'un avis n'est
 * pas parti ; une reconstitution envoie un rectificatif.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats et contacts écrits par Prisma : même dette que
 * `collection-batch-scene.ts`. Aucune date absolue : la clôture est le
 * dernier 1er du mois atteint, calculé par le domaine.
 */
import type { CollectionCycleView, ConstitutedBatchesView } from "@lfd/contracts";
import type { SendMailArgs } from "@lfd/mailer";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import type { B2bMails } from "../src/platform/mailer/mail-templates.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser, deliveredOnColumn } from "./factories.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ICS = "FR72ZZZ123456";
export const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
export const BASE = "/admin/accounting/collection";

export const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

export type SentMail = SendMailArgs<B2bMails>;
export const sentMails: SentMail[] = [];
let refusal: Error | null = null;

/** Le prochain envoi est refusé par le fournisseur — la scène le remet à `null` à chaque cas. */
export function refuseMailsWith(error: Error): void {
  refusal = error;
}
/** Enregistre — ou refuse, quand le test le demande. Rien ne part. */
export const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    if (refusal !== null) {
      return Promise.reject(refusal);
    }
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

export let ctx: E2eContext;
export let seq = 0;
export let closesAt: Date;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

export async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
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
    .send({ ...DEBTOR_RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
    .expect(204);
  return id;
}

/** Une société avec son mandat B2B actif ; ses adresses d'avis sont posées à part. */
export async function payer(entityId: string, name: string): Promise<{ id: string; rum: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  const rum = `RUM-AVIS-${String(seq)}`;
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: rum,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return { id: company.id, rum };
}

export async function billingContact(companyId: string, email: string): Promise<void> {
  await ctx.prisma.companyContact.create({
    data: { companyId, prenom: "Claire", nom: "Compta", email, role: "billing" },
  });
}

export async function owner(companyId: string, email: string): Promise<void> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `avis-owner-${String(seq)}`, email });
  await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
}

/** Un bon de 100 € HT à 5,5 %, deux jours avant la clôture. */
export async function orderOf(companyId: string): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `avis-${String(seq)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-AVIS-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      deliveredOn: deliveredOnColumn(new Date(closesAt.getTime() - 2 * DAY_MS)),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-AVIS",
          productNameSnapshot: "Pain de l'avis",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true },
  });
  return order.id;
}

/** Constitue, puis attend que la boîte d'envoi ait livré les avis. */
export async function constitute(entityId: string): Promise<string> {
  const response = await staff()
    .post(`${BASE}/batches`)
    .send({ legalEntityId: entityId })
    .expect(201);
  await ctx.drain();
  return jsonBody<ConstitutedBatchesView>(response).batchIds[0] ?? "";
}

export async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useCollectionNoticeScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: MAILER, value: recordingMailer },
      ],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    sentMails.splice(0);
    refusal = null;
    closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
    await ctx.prisma.collectionFloor.create({
      data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
    });
  });
}
