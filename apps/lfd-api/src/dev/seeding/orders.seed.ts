import type { BillingAddressPayload, PlaceOrderPayload } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { STILL_SOLD } from "../../b2b/catalog/infrastructure/sellable-filter.js";
import { PlaceOrderCommand } from "../../b2b/orders/application/commands/place-order.command.js";
import { PaymentStatus } from "../../platform/database/client/client.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { randomUUID } from "node:crypto";

import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { resetProduction, type ProductionResetReport } from "./production.seed.js";
import { CLIENT_RAISON_SOCIALE } from "./client.seed.js";

/**
 * **Les commandes du client de référence**, calées sur l'horloge du jour.
 *
 * ## L'invariant, et pourquoi il vaut un module à lui seul
 *
 * Trois commandes doivent exister **quel que soit le jour où on sème** :
 *
 * | Quand | Quoi |
 * | --- | --- |
 * | **hier** | une commande servie la veille |
 * | **demain** | deux commandes en attente — une en LIVRAISON, une en RETRAIT |
 *
 * Un corpus daté en dur vieillit : semé un lundi, il montre le mardi une
 * « prochaine commande » déjà passée, et l'écran de production s'ouvre sur du
 * vide. Ces trois-là sont donc **recalculées à chaque exécution**.
 *
 * Les deux modes d'acheminement le même jour ne sont pas une coquetterie : c'est
 * la seule configuration où l'on voit, sur un même écran de production, que le
 * retrait et la livraison ne se préparent pas pareil.
 *
 * ## Ce qu'il supprime, et rien d'autre
 *
 * ⚠️ Les commandes **de ce client** sont effacées puis reposées. C'est la seule
 * façon de tenir « toujours » : garder les anciennes accumulerait, à chaque
 * exécution, une commande de plus pour un lendemain révolu. La suppression est
 * bornée par `companyId` — aucune autre société n'est touchée, et le catalogue,
 * la station et le référentiel ne le sont jamais.
 *
 * ## Par les vrais handlers
 *
 * Prix ré-résolus au catalogue, TVA calculée par l'agrégat, heure limite
 * opposée. Chaque commande est posée dans un **contexte daté** : le `Clock` lit
 * ce `now`, donc la limite se juge comme elle se jugerait ce jour-là.
 *
 * Seule `created_at` est réécrite après coup — cette colonne a un défaut SQL que
 * ni le `Clock` ni le contexte de requête ne devancent.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Neuf heures du matin : une heure de commande plausible, et avant toute limite. */
const ORDER_HOUR = 9;

/**
 * L'historique : une commande tous les dix jours sur deux mois. Assez pour que
 * « ses habitudes » veuille dire quelque chose, pas au point de noyer la liste.
 */
const HISTORY_COUNT = 6;
const HISTORY_EVERY_DAYS = 10;

/**
 * Ce que cette maison reprend **presque toujours** — le cœur de ses habitudes,
 * et ce que l'écran de saisie du back-office doit proposer en premier.
 */
const CORE: readonly { readonly sku: string; readonly base: number }[] = [
  { sku: "VIE-001", base: 40 }, // Croissant
  { sku: "VIE-002", base: 30 }, // Pain au chocolat
  { sku: "PAI-001", base: 25 }, // Baguette tradition
  { sku: "VIE-009", base: 12 }, // Pain au lait
];

/** Pris de temps en temps — la queue de distribution, celle qui passe après. */
const OCCASIONAL: readonly { readonly sku: string; readonly every: number }[] = [
  { sku: "VIE-005", every: 2 }, // Chausson aux pommes
  { sku: "PAI-013", every: 3 }, // Pain complet
];

/**
 * Un produit **abandonné** en cours de route : présent au début, plus jamais
 * ensuite. Il exerce le cas « commandé autrefois » — la liste doit continuer de
 * le montrer, et l'écran de ne plus le proposer si le catalogue le retire.
 */
const ABANDONED = { sku: "VIE-016", untilStep: 2 }; // Sablé suisse

/** Un produit **récent** : rien au début, puis à chaque fois. */
const NEWCOMER = { sku: "VIE-019", fromStep: 4 }; // Gros cookie

/** L'adresse de livraison, telle que la commande la fige. */
const DELIVERY: BillingAddressPayload = {
  label: "La Folie Douce",
  ligne1: "Sommet du téléphérique de La Daille",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

interface Target {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupAddressId: string | null;
  /** L'adresse **du carnet** que la livraison reprend, quand il y en a une. */
  readonly deliveryAddressId: string | null;
}

/** Ce que le semis a posé — de quoi le raconter à qui l'a demandé. */
export interface OrdersReport {
  readonly removed: number;
  /** Ce que la coupe a emporté chez le fournil — plans et attestations. */
  readonly production: ProductionResetReport;
  readonly placed: number;
  readonly yesterday: string;
  readonly tomorrow: string;
}

/** Le minimum dont ce module a besoin : la base, le bus, et de quoi dater. */
export interface SeedContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
  /**
   * **L'instant du semis**, posé par l'appelant — et non lu au mur ici.
   *
   * C'est l'ancre de TOUT l'historique posé : chaque commande est datée par
   * décalage depuis lui. Le lire au fond de cette fonction rendait le semis
   * ni gelable ni rejouable, et la porte `clock-port` le refusait.
   */
  readonly now: Date;
}

export async function seedOrders(context: SeedContext): Promise<OrdersReport> {
  const target = await resolveTarget(context);
  await ensureSkusExist(context);
  const removed = await context.prisma.order.deleteMany({
    where: { companyId: target.companyId },
  });
  // 🔴 Le fournil AUSSI, et dans le même geste. Ses tables portent des copies de
  // ces commandes — un plan du soir, ses fiches, son compte à produire — que
  // rien ne rattache par clé étrangère : la coupe ci-dessus les laisserait
  // derrière, à parler de commandes qui n'existent plus. Cf. `production.seed`.
  const production = await resetProduction(context.prisma);

  const today = atHour(context.now, ORDER_HOUR);
  let placed = 0;

  // L'historique, du plus ancien au plus récent.
  for (let step = HISTORY_COUNT; step >= 1; step -= 1) {
    const at = shiftDays(today, -step * HISTORY_EVERY_DAYS);
    await place(context, target, {
      at,
      // Retrait le lendemain de la commande : la règle du parcours réel.
      forDay: isoDay(shiftDays(at, 1)),
      method: "pickup",
      lines: linesFor(step),
      paid: step % 3 === 1,
    });
    placed += 1;
  }

  // 🔴 HIER — servie la veille. Commandée l'avant-veille, comme le reste.
  await place(context, target, {
    at: shiftDays(today, -2),
    forDay: isoDay(shiftDays(today, -1)),
    method: "pickup",
    lines: linesFor(0),
    paid: false,
  });

  // 🔴 DEMAIN — deux en attente, une par mode d'acheminement.
  await place(context, target, {
    at: today,
    forDay: isoDay(shiftDays(today, 1)),
    method: "delivery",
    lines: linesFor(1),
    paid: false,
  });
  await place(context, target, {
    at: today,
    forDay: isoDay(shiftDays(today, 1)),
    method: "pickup",
    lines: linesFor(2),
    paid: false,
  });

  return {
    removed: removed.count,
    production,
    placed: placed + 3,
    yesterday: isoDay(shiftDays(today, -1)),
    tomorrow: isoDay(shiftDays(today, 1)),
  };
}

/** La société de référence, son acheteur, et le point de retrait par défaut. */
async function resolveTarget(context: SeedContext): Promise<Target> {
  const company = await context.prisma.company.findFirst({
    where: { raisonSociale: CLIENT_RAISON_SOCIALE },
    select: { id: true },
  });
  if (company === null) {
    throw new Error(
      `Société « ${CLIENT_RAISON_SOCIALE} » absente : semer le client avant ses commandes.`,
    );
  }
  const member = await context.prisma.membership.findFirst({
    where: { companyId: company.id },
    select: { userId: true },
  });
  if (member === null) {
    throw new Error(
      `La société « ${CLIENT_RAISON_SOCIALE} » n'a aucun membre : rien à qui porter.`,
    );
  }
  const labo = await context.prisma.pickupAddress.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  const carnet = await context.prisma.address.findFirst({
    where: { companyId: company.id, kind: "delivery", isDefault: true },
    select: { id: true },
  });
  return {
    companyId: company.id,
    buyerUserId: member.userId,
    // `null` = le point par DÉFAUT, résolu par le domaine. On le passe explicite
    // quand il existe pour que la commande fige le bon libellé.
    pickupAddressId: labo?.id ?? null,
    // L'IDENTITÉ de l'adresse, en plus de son instantané postal : sans elle le
    // serveur ne sait pas de quelles consignes de site la commande s'écarte.
    deliveryAddressId: carnet?.id ?? null,
  };
}

/**
 * **Les SKU déclarés existent-ils au catalogue ?**
 *
 * 🔴 Vérifié D'ABORD, et tous ensemble. Sans ce contrôle, le seed posait trois
 * commandes puis mourait sur la quatrième avec une pile de trente lignes, en
 * laissant la base à moitié faite — et le message ne disait pas quoi lancer pour
 * réparer. Un corpus de démonstration qui échoue doit échouer AVANT d'écrire.
 *
 * Ce sont des SKU de **produit** (`VIE-001`), pas de déclinaison (`VIE-001-1`) :
 * la commande résout la déclinaison par défaut, comme la boutique.
 */
async function ensureSkusExist(context: SeedContext): Promise<void> {
  const wanted = [
    ...CORE.map((item) => item.sku),
    ...OCCASIONAL.map((item) => item.sku),
    ABANDONED.sku,
    NEWCOMER.sku,
  ];
  const known = await context.prisma.catalogItem.findMany({
    // `STILL_SOLD` et pas un `withdrawnAt: null` recopié : la condition du
    // retrait est NOMMÉE une fois, et la porte `withdrawn-filter` refuse une
    // lecture qui la réécrit à la main — c'est ainsi qu'elle finit par dériver.
    where: { productSku: { in: wanted }, isDefault: true, ...STILL_SOLD },
    select: { productSku: true },
  });
  const found = new Set(known.map((item) => item.productSku));
  const missing = wanted.filter((sku) => !found.has(sku));
  if (missing.length > 0) {
    throw new Error(
      `Articles absents du catalogue B2B : ${missing.join(", ")}. ` +
        "Le miroir n'a peut-être jamais été poussé — lancer : pnpm --filter lfd-api seed:pim",
    );
  }
}

/**
 * La tranche demandée sur une commande de RETRAIT du semis.
 *
 * Elle tient dans le créneau **professionnel** du Labo (05:00–06:30), pas dans
 * son ouverture publique : c'est le cas qu'un jeu de données doit montrer, parce
 * que c'est celui qu'un client pro emprunte. Une fenêtre à cheval sur les deux
 * serait refusée — il y a porte close entre les deux.
 */
const PICKUP_WINDOW = { start: "05:30", end: "06:30" } as const;

/** Pose une commande par le vrai handler, puis recale sa date de création. */
async function place(
  context: SeedContext,
  target: Target,
  order: {
    readonly at: Date;
    readonly forDay: string;
    readonly method: "pickup" | "delivery";
    readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
    readonly paid: boolean;
  },
): Promise<void> {
  const payload: PlaceOrderPayload = {
    // Chaque commande du semis est une tentative DISTINCTE : une clé par
    // commande, sinon la seconde serait rendue comme un rejeu de la première et
    // le semis poserait une seule ligne au lieu de son historique.
    idempotencyKey: randomUUID(),
    companyId: target.companyId,
    fulfillmentMethod: order.method,
    deliveryAddress: order.method === "delivery" ? DELIVERY : null,
    deliveryAddressId: order.method === "delivery" ? target.deliveryAddressId : null,
    pickupAddressId: order.method === "pickup" ? target.pickupAddressId : null,
    // 🔴 Aucune commande semée ne demandait de tranche horaire, donc le bon de
    // commande — qui affiche la fenêtre convenue — n'avait rien à montrer sur un
    // poste. En RETRAIT elle se demande explicitement ; en LIVRAISON elle vient
    // du carnet, que `defaultsFor` lit à partir de `deliveryAddressId`. Deux
    // provenances différentes, et c'est le sujet : la commande dit laquelle.
    //
    // ⚠️ La tranche doit tenir dans UNE fenêtre d'ouverture du point, jamais
    // dans leur union — le serveur refuse sinon, et il a raison : entre le
    // créneau pro et l'ouverture publique du Labo, il y a porte close.
    //
    // 🔴 **`undefined` et `null` ne disent PAS la même chose**, et les confondre
    // a coûté un aller-retour : `agreeFulfillment` lit l'absence comme « prends
    // le défaut » et un `null` explicite comme « le client n'en veut aucune ».
    // Envoyer `null` en livraison ÉCRASAIT donc la fenêtre du carnet, et la
    // commande sortait avec `source: "override"` et `value: null`. La clé est
    // omise, pas mise à `null`.
    ...(order.method === "pickup" ? { requestedWindow: PICKUP_WINDOW } : {}),
    requestedDeliveryDate: order.forDay,
    note: "",
    lines: [...order.lines],
  };
  const placed = await runWithRequestContext(
    // Le contexte DATÉ : le `Clock` y lit `order.at`, donc l'heure limite se juge
    // comme elle se jugerait ce jour-là — pas comme aujourd'hui.
    { now: order.at, traceId: newTraceId(), actor: { type: "customer", id: target.buyerUserId } },
    () =>
      context.commands.execute<PlaceOrderCommand, { id: string }>(
        new PlaceOrderCommand(target.buyerUserId, payload),
      ),
  );
  await context.prisma.order.update({
    where: { id: placed.id },
    data: {
      createdAt: order.at,
      ...(order.paid ? { paymentStatus: PaymentStatus.paid } : {}),
    },
  });
}

/**
 * Les lignes d'une échéance : le cœur qui oscille, plus ce qui va et vient.
 *
 * `step` compte les échéances dans l'ordre du TEMPS — 0 = la plus récente. Des
 * quantités identiques d'une fois sur l'autre feraient mentir toute moyenne
 * calculée dessus, et « les plus repris » ne voudrait rien dire.
 */
function linesFor(step: number): { readonly sku: string; readonly quantity: number }[] {
  const lines = CORE.map((item) => ({
    sku: item.sku,
    // Déterministe : deux exécutions du seed ne se contredisent pas.
    quantity: Math.max(1, item.base + ((step * 7) % 11) - 5),
  }));
  for (const item of OCCASIONAL) {
    if (step % item.every === 0) {
      lines.push({ sku: item.sku, quantity: 4 + (step % 5) });
    }
  }
  if (step >= HISTORY_COUNT - ABANDONED.untilStep) {
    lines.push({ sku: ABANDONED.sku, quantity: 6 });
  }
  if (step <= NEWCOMER.fromStep) {
    lines.push({ sku: NEWCOMER.sku, quantity: 3 });
  }
  return lines;
}

/**
 * Le même jour, à l'heure dite.
 *
 * ⚠️ **`setHours` et non une soustraction de millisecondes.** Retrancher des
 * multiples de 24 h traverse un changement d'heure, et la journée obtenue glisse
 * alors d'une heure — c'est ce glissement qui avait produit dix doublons dans le
 * seed témoin.
 */
function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

/** Le jour décalé, l'heure reposée — cf. {@link atHour}. */
function shiftDays(from: Date, days: number): Date {
  return atHour(new Date(from.getTime() + days * DAY_MS), from.getHours());
}

function isoDay(date: Date): string {
  // Composé à la main : `toISOString` bascule en UTC et rend la veille pour
  // toute heure locale avant 02 h en été.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
