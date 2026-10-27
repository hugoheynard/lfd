import { OrderRowsLock } from "../src/b2b/accounting/domain/ports/order-rows-lock.js";
import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { PrismaOrderRowsLock } from "../src/b2b/accounting/infrastructure/prisma-order-rows-lock.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { setUpEntity } from "./collection-returns-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import {
  addBillingAddress,
  attachTo,
  createCompany,
  createUser,
  markDelivered,
} from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";

/**
 * **La scène de l'annulation d'une commande AU COMPTE** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C5) — partagée
 * par la suite des gestes et celle des courses.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`), le courrier
 * (enregistré), l'horloge (FIXE, posée relativement au mois précédent le
 * jour du test). Et une ENVELOPPE qui délègue au vrai verrou de lignes
 * `orders` (`PrismaOrderRowsLock`) : elle glisse un geste juste AVANT le
 * verrou (entre la lecture et lui) ou juste APRÈS (pendant qu'il est tenu).
 * Tout le reste tourne sur le vrai Postgres.
 *
 * Les commandes sont passées au compte par le vrai chemin (`placeOrder`,
 * plan T), antidatées. ⚠️ Mandats et planchers écrits par Prisma, faute de
 * chemin public pour les poser ; deux écritures de commande brutes restent,
 * datées au-dessus d'elles (`accountOrder`).
 */

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const COLLECTION = "/admin/accounting/collection";
const RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

type Hook = (orderIds: readonly string[]) => Promise<void>;

export const account = {
  ctx: null as E2eContext | null,
  clock: new FixedClock(new Date()),
  /** La clôture du mois précédent le jour du test. */
  closesAt: new Date(),
  /** Son ouverture : la clôture d'avant, celle du lot que l'horloge de la scène constitue. */
  startsAt: new Date(),
  mails: [] as { readonly template: string; readonly data: unknown }[],
  /** Joué une fois, juste avant le vrai `lockAll`. */
  beforeRowsLock: null as Hook | null,
  /** Joué une fois, juste après le vrai `lockAll` — le verrou est tenu. */
  afterRowsLock: null as Hook | null,
};

export function context(): E2eContext {
  if (account.ctx === null) {
    throw new Error("la scène n'est pas bootée");
  }
  return account.ctx;
}

const recordingMailer = {
  enabled: true,
  send: (args: { readonly template: string; readonly data: unknown }) => {
    account.mails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

/** Le vrai verrou, encadré des deux crochets. */
const hookedRowsLock = {
  lockAll: async (orderIds: readonly string[]): Promise<void> => {
    const before = account.beforeRowsLock;
    account.beforeRowsLock = null;
    if (before !== null) {
      await before(orderIds);
    }
    await new PrismaOrderRowsLock(context().app.get(PrismaService)).lockAll(orderIds);
    const after = account.afterRowsLock;
    account.afterRowsLock = null;
    if (after !== null) {
      await after(orderIds);
    }
  },
};

export async function bootAccountScene(): Promise<E2eContext> {
  account.ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: account.clock },
      { token: OrderRowsLock, value: hookedRowsLock },
    ],
  });
  return account.ctx;
}

/**
 * Base vide, planchers au début du mois précédent, horloge au dernier jour
 * de ce mois à 23h57 (Paris) : la facture du mois est due (E4b).
 */
export async function resetAccountScene(): Promise<void> {
  const ctx = context();
  await ctx.reset();
  account.mails.splice(0);
  account.beforeRowsLock = null;
  account.afterRowsLock = null;
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  account.closesAt = month.cycle().closesAt;
  account.clock.set(new Date(invoicingMomentOf(account.closesAt).getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  account.startsAt = startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
}

/** Le lot du 1er se constitue sur le mois clos : l'horloge passe la clôture. */
export function afterClosure(): void {
  account.clock.set(new Date(account.closesAt.getTime() + 2 * HOUR_MS));
}

/**
 * Les bons d'avant la mise en service de la facture du mois se prélèvent
 * sous ARRÊTÉ, sans facture : le plancher de la facture passe la clôture.
 */
export async function statementPath(): Promise<void> {
  await context().prisma.invoicingFloor.update({
    where: { id: true },
    data: { floorAt: account.closesAt },
  });
}

export function staff(): ReturnType<E2eContext["asSub"]> {
  return context().asSub(E2E_STAFF_SUB);
}

export const entity = () => setUpEntity(staff);

let seq = 0;

/** Un payeur au compte : mandat B2B actif (sauf `mandate: false`), détenteur joignable. */
export async function payer(
  entityId: string,
  options: { readonly mandate?: boolean } = {},
): Promise<{ readonly companyId: string; readonly ownerId: string }> {
  seq += 1;
  const ctx = context();
  const company = await createCompany(ctx.prisma, { raisonSociale: `Hôtel ${String(seq)}` });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045", grantedTerms: ["monthly"] },
  });
  if (options.mandate !== false) {
    await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
    await ctx.prisma.paymentMandate.create({
      data: {
        companyId: company.id,
        creditorId: entityId,
        reference: `RUM-C5-${String(seq)}`,
        status: "active",
        acceptedAt: new Date(account.closesAt.getTime() - 60 * DAY_MS),
        scheme: "B2B",
        paymentType: "recurrent",
      },
    });
  }
  const owner = await createUser(ctx.prisma, {
    auth0Sub: `c5-owner-${String(seq)}`,
    email: `patron${String(seq)}@c5.test`,
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  return { companyId: company.id, ownerId: owner.id };
}

/** Un bon au compte : son identifiant, son numéro, et le total TTC que la passation a facturé. */
export interface AccountOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
}

/**
 * Un bon au compte, passé deux jours avant la clôture par le vrai chemin
 * (`placeOrder`, plan T) et retiré au comptoir une heure après (lot ZA : sans
 * date de livraison, pas de facture). `id` permet de choisir l'identifiant
 * (casse mêlée, pour la collation) ; `incoherent` en fait un bon non
 * facturable.
 */
export async function accountOrder(
  who: { readonly companyId: string; readonly ownerId: string },
  options: { readonly id?: string; readonly incoherent?: boolean } = {},
): Promise<AccountOrder> {
  const ctx = context();
  const placedAt = new Date(account.closesAt.getTime() - 2 * DAY_MS);
  const placed =
    options.id === undefined
      ? await placeOrder(ctx, {
          buyerUserId: who.ownerId,
          companyId: who.companyId,
          settlement: "account",
          placedAt,
          fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
        })
      : await chosenIdOrder(who, options.id, placedAt);
  if (options.incoherent === true) {
    // Un centime de trop : le total ne se recompose pas, le bon n'est pas
    // facturable (`unbillable`). Aucune route ne produit un tel bon — c'est
    // la panne que le lot écarte. Posé après la vraie passation (plan T,
    // 2026-10-25).
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: { totalCents: { increment: 1 } },
    });
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: placed.id },
    select: { id: true, orderNumber: true, createdAt: true, totalCents: true },
  });
  // Livré : un bon sans date de livraison ne se facture pas (M5). La date
  // seule, SANS attestation de retrait : une commande attestée est retirée,
  // et une retirée ne s'annule plus (C3.6, course fermée le 2026-10-25). La
  // scène attestait sans que le fait ne bascule la commande — un état que
  // seule la fenêtre de la boîte d'envoi produisait, et que l'annulation
  // refuse désormais sous son verrou.
  await markDelivered(ctx.prisma, row.id, new Date(row.createdAt.getTime() + HOUR_MS));
  return { id: row.id, orderNumber: row.orderNumber, totalCents: row.totalCents };
}

let chosenSeq = 0;

/**
 * **Exception gardée du plan T (2026-10-25)** : un bon dont la suite CHOISIT
 * l'identifiant (casse mêlée, pour éprouver la collation de l'ordre des
 * verrous). La passation tire son identifiant elle-même ; aucune route ne
 * le laisse choisir. Écrit en base, 100 € HT à 5,5 %, numéro au format réel
 * hors de portée de la séquence.
 */
async function chosenIdOrder(
  who: { readonly companyId: string; readonly ownerId: string },
  id: string,
  createdAt: Date,
): Promise<{ readonly id: string }> {
  chosenSeq += 1;
  return context().prisma.order.create({
    data: {
      // Écrite à la main, hors agrégat : la méthode du pro et d'avant la voie B.
      vatMethod: "line_ht",
      id,
      orderNumber: `ORD-${String(800_000 + chosenSeq)}`,
      companyId: who.companyId,
      placedByUserId: who.ownerId,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
      createdAt,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "VIE-001",
          productNameSnapshot: "Croissant",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true },
  });
}

export const REASON = "Le client s'est trompé de semaine";

export function cancelRequest(orderId: string) {
  return staff().post(`/admin/orders/${orderId}/cancel`).send({ reason: REASON });
}

export function settleRequest(orderId: string) {
  return staff()
    .post(`${COLLECTION}/orders/${orderId}/settle-otherwise`)
    .send({ note: "virement reçu" });
}

export function issueRequest(entityId: string) {
  return staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: account.closesAt.toISOString() });
}

export function constituteRequest(entityId: string) {
  return staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId });
}

/** Livre la boîte d'envoi, et attend les abonnés de fond. */
export async function deliver(): Promise<void> {
  const ctx = context();
  await ctx.app.get(OutboxRelay).sweep();
  await ctx.drain();
}

export async function collectionStateOf(orderId: string): Promise<string> {
  const row = await context().prisma.orderCollection.findUnique({ where: { orderId } });
  return row?.state ?? "absent";
}

/** Les commandes facturées (380), par identifiant. */
export async function invoicedOrderIds(): Promise<readonly string[]> {
  const rows = await context().prisma.invoiceOrder.findMany({ select: { orderId: true } });
  return rows.map((row) => row.orderId).sort();
}

/**
 * Attend qu'une session de la base attende un verrou — la preuve que le
 * geste lancé est bien bloqué derrière celui qu'on tient.
 */
export async function lockWaiter(): Promise<void> {
  // Cinq cents essais de 20 ms : dix secondes, sans lire l'horloge du mur.
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const rows = await context().prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if ((rows[0]?.waiting ?? 0n) > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("aucun geste n'attend le verrou : la course n'a pas eu lieu");
}
