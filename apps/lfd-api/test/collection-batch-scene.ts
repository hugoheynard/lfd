/**
 * Scène partagée par les suites `collection-batch-*.e2e-spec.ts`, découpées par étape
 * le 2026-10-23 : boot, remise à zéro, et les mises en place communes.
 *
 * E2E du **lot de prélèvement figé** (plan
 * `documentation/comptabilite/prelevement/lot-de-prelevement-fige.md`).
 *
 * Ce que seul le vrai SQL prouve : le fichier STOCKÉ rend les mêmes octets,
 * un lot reconstitué change de `MsgId`, l'index partiel tient un lot vivant par
 * cycle, la course avec la passation laisse la commande tardive `due`, et la
 * relecture du dépôt voit un mandat révoqué en base.
 *
 * Les commandes passent par le vrai chemin (`placeOrder`, plan T), leur
 * demi-centime par une vraie mercuriale. ⚠️ Mandats et suivis écrits par
 * Prisma : même dette que `accounting-legal-entity.e2e-spec.ts`. Le plancher est rejoué à chaque
 * remise à zéro — la migration le pose, le `TRUNCATE` l'emporte.
 *
 * Aucune date absolue : la clôture est le dernier 1er du mois atteint, calculé
 * par le domaine depuis l'instant présent ; les commandes tombent deux jours
 * avant, le plancher trente jours avant.
 */
import {
  instantToLocal,
  type CollectionCycleView,
  type ConstitutedBatchesView,
} from "@lfd/contracts";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser, markDelivered } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

export const SIREN = "552100554";
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
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/**
 * Aucun courriel ne part d'un e2e : les avis de prélèvement (PA2) sont rendus
 * à ce mailer, qui accepte sans rien envoyer.
 */
export const silentMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

export let ctx: E2eContext;
export let seq = 0;
/** La dernière clôture calendaire atteinte — le cycle qu'on constitue. */
export let closesAt: Date;

export function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

export const BASE = "/admin/accounting/collection";

export async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: SIREN,
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
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Le détenteur de chaque société cliente : c'est lui qui y passe commande. */
const owners = new Map<string, string>();

/**
 * Une société cliente au compte mensuel, avec son détenteur et un contact de
 * facturation : son avis de prélèvement part, et le dépôt n'est refusé que
 * pour ce que le test éprouve.
 */
export async function client(name: string, parentId?: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  seq += 1;
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: {
      grantedTerms: ["monthly"],
      ...(parentId === undefined ? {} : { parentCompanyId: parentId }),
    },
  });
  await ctx.prisma.companyContact.create({
    data: {
      companyId: company.id,
      prenom: "Claire",
      nom: "Compta",
      email: `compta-${String(seq)}@client.test`,
      role: "billing",
    },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: `lot-${String(seq)}` });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  owners.set(company.id, owner.id);
  return company.id;
}

/** Un mandat actif B2B de cette société chez l'entité, avec son RIB. */
export async function mandated(entityId: string, companyId: string): Promise<string> {
  seq += 1;
  await staff().put(`/admin/companies/${companyId}/bank-account`).send(DEBTOR_RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId,
      creditorId: entityId,
      reference: `RUM-LOT-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return mandate.id;
}

/**
 * Ce qu'un bon commande : une ligne, et le prix négocié qui la tarife s'il y
 * en a un (une mercuriale posée sur la société, par sa route).
 */
export interface BonSpec {
  readonly sku: string;
  readonly quantity: number;
  readonly mercurialeMillicents?: number;
}

/** Cinquante croissants au tarif du catalogue : un bon facturable, sans écart d'arrondi. */
export const PLAIN_BON: BonSpec = { sku: "VIE-001", quantity: 50 };
/**
 * Une baguette négociée à 10 500 millicentimes HT (10,5 c) : le bon arrondit à 11 c et porte 1 c de
 * TVA. La facture de deux bons reprend 22 c de HT (F6) et taxe 22 c une fois :
 * 1 c — 23 c contre 24. Le demi-centime est un vrai tarif, pas une ligne
 * inventée : la passation le résout depuis la mercuriale.
 */
export const HALF_CENT_BON: BonSpec = { sku: "PAI-001", quantity: 1, mercurialeMillicents: 10_500 };

/** Trois jours avant le jour de service : l'heure limite est loin. */
const LEAD_DAYS = 3;

/** Pose la mercuriale de la société sur ce SKU, valable autour de la clôture. */
async function negotiate(
  companyId: string,
  sku: string,
  unitPriceMillicents: number,
): Promise<void> {
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale du lot",
      validFrom: new Date(closesAt.getTime() - 90 * DAY_MS).toISOString(),
      validTo: new Date(closesAt.getTime() + 365 * DAY_MS).toISOString(),
      lines: [{ sku, unitPriceMillicents }],
    })
    .expect(201);
}

/** Les sociétés dont la mercuriale est déjà posée dans ce test. */
const negotiated = new Set<string>();

/** Un bon passé, et ce que la passation a écrit — relu, jamais recopié. */
export interface PlacedBon {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
}

/**
 * Une commande passée au compte par le vrai chemin (`placeOrder`, plan T),
 * servie `daysBefore` jours avant la clôture, passée trois jours plus tôt, et
 * livrée le jour de service — aucune route ne remet une commande dans le
 * passé (plan T, 2026-10-25).
 */
export async function orderOf(
  companyId: string,
  daysBefore = 2,
  bon: BonSpec = PLAIN_BON,
): Promise<PlacedBon> {
  if (bon.mercurialeMillicents !== undefined && !negotiated.has(companyId)) {
    await negotiate(companyId, bon.sku, bon.mercurialeMillicents);
    negotiated.add(companyId);
  }
  const servedAt = new Date(closesAt.getTime() - daysBefore * DAY_MS);
  const buyerUserId = owners.get(companyId);
  if (buyerUserId === undefined) {
    throw new Error(`Scène du lot : « ${companyId} » n'a pas été semée par client().`);
  }
  const order = await placeOrder(ctx, {
    buyerUserId,
    companyId,
    settlement: "account",
    placedAt: new Date(servedAt.getTime() - LEAD_DAYS * DAY_MS),
    forDay: instantToLocal(servedAt).day,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: bon.sku, quantity: bon.quantity }],
  });
  await markDelivered(ctx.prisma, order.id, servedAt);
  const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true },
  });
  return { id: order.id, orderNumber: order.orderNumber, totalCents };
}

/** Constitue, puis attend que les avis en file soient partis (PA2). */
export async function constitute(entityId: string, expected = 201): Promise<readonly string[]> {
  const response = await staff()
    .post(`${BASE}/batches`)
    .send({ legalEntityId: entityId })
    .expect(expected);
  await ctx.drain();
  return expected === 201 ? jsonBody<ConstitutedBatchesView>(response).batchIds : [];
}

export async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

export function messageIdOf(xml: string): string {
  return /<MsgId>([^<]*)</u.exec(xml)?.[1] ?? "";
}

export async function stateOf(orderId: string): Promise<string> {
  const row = await ctx.prisma.orderCollection.findUnique({ where: { orderId } });
  return row?.state ?? "absent";
}

/**
 * Pose la scène pour la suite qui l'appelle : boot, remise à zéro, fermeture.
 * À appeler une fois, au niveau du module de la suite.
 */
export function useCollectionBatchScene(): void {
  beforeAll(async () => {
    ctx = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: MAILER, value: silentMailer },
      ],
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    owners.clear();
    negotiated.clear();
    closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
    await ctx.prisma.collectionFloor.create({
      data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
    });
  });
}
