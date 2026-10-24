/**
 * Scène partagée par les suites `collection-autopilot-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E de la **constitution automatique** (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA3).
 *
 * Ce que seul le vrai SQL prouve : le passage constitue sous l'auteur
 * `system` (le CHECK tient « aucune fiche staff »), les avis partent comme
 * pour le bouton, et la clé (entité, clôture) interdit une seconde tentative
 * — même après l'annulation du lot. Une clôture antérieure jamais tentée
 * suspend l'automatisme (`missed`, CHECK élargi en R4b) jusqu'au lot manuel.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats et contacts écrits par Prisma : même dette que
 * `collection-batch-scene.ts`. Aucune date absolue : la clôture est le
 * dernier 1er du mois atteint, calculé par le domaine, et l'horloge FIXE est
 * posée relativement à elle.
 */
import type { CollectionCycleView, LegalEntityView } from "@lfd/contracts";
import type { CollectionAutopilotReport } from "../src/b2b/accounting/application/commands/run-collection-autopilot.command.js";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser, receivedColumns } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
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
export const ENTITIES = "/admin/accounting/legal-entities";
export const AUTOPILOT = `${BASE}/autopilot`;

export const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

export const sentMails: string[] = [];
/** Enregistre le destinataire. Rien ne part. */
export const recordingMailer = {
  enabled: true,
  send: (args: { readonly to: string }): Promise<{ providerId: null }> => {
    sentMails.push(args.to);
    return Promise.resolve({ providerId: null });
  },
};

export const clock = new FixedClock(new Date());
export let ctx: E2eContext;
export let seq = 0;
export let closesAt: Date;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Une entité ; complète (ICS + compte) sauf demande contraire, automatisme activé. */
export async function entity(options: { readonly complete: boolean } = { complete: true }) {
  const response = await staff()
    .post(ENTITIES)
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
  if (options.complete) {
    await staff().put(`${ENTITIES}/${id}/creditor-identifier`).send({ ics: ICS }).expect(204);
    await staff()
      .put(`${ENTITIES}/${id}/creditor-account`)
      .send({ ...DEBTOR_RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
      .expect(204);
  }
  await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: true }).expect(204);
  return id;
}

/** Un payeur avec mandat B2B actif, un détenteur joignable, et un bon du mois clos. */
export async function payerWithOrder(entityId: string): Promise<void> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Port" });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-AUTO-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const owner = await createUser(ctx.prisma, {
    auth0Sub: `auto-owner-${String(seq)}`,
    email: "patron@port.test",
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-AUTO-${String(seq)}`,
      companyId: company.id,
      placedByUserId: owner.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      ...receivedColumns(new Date(closesAt.getTime() - 2 * DAY_MS)),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-AUTO",
          productNameSnapshot: "Pain de l'automatisme",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
  });
}

/** Un passage du cron, jeton présenté ; attend la livraison des avis. */
export async function pass(): Promise<CollectionAutopilotReport> {
  const response = await ctx
    .http()
    .post(AUTOPILOT)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<CollectionAutopilotReport>(response);
}

export async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

export async function fiche(entityId: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${ENTITIES}/${entityId}`).expect(200));
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useCollectionAutopilotScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: MAILER, value: recordingMailer },
        { token: Clock, value: clock },
      ],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    sentMails.splice(0);
    closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
    // Deux heures après la clôture : passé le délai d'une heure par défaut.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await ctx.prisma.collectionFloor.create({
      data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
    });
  });
}
