import type {
  BillingAddressPayload,
  OpenPackingContainer,
  PlaceOrderPayload,
} from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";

import { PlaceOrderCommand } from "../../b2b/orders/application/commands/place-order.command.js";
import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { PaymentStatus } from "../../platform/database/client/client.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { AllocateToContainerCommand } from "../../packing/application/containers/allocate-to-container.command.js";
import { OpenPackingContainerCommand } from "../../packing/application/containers/open-packing-container.command.js";
import { MarkWorksheetLineCommand } from "../../production/application/commands/mark-worksheet-line.command.js";
import { ClosePackingOrderCommand } from "../../packing/application/station/close-packing-order.command.js";
import { CLIENT_RAISON_SOCIALE } from "./client.seed.js";

/**
 * **Les gestes communs du semis de commandes** — poser une commande par le vrai
 * handler, faire son sac comme au fournil, dater.
 *
 * Sortis de `orders.seed.ts` le 2026-09-29, quand la journée de livraison
 * (`delivery-day.seed.ts`) a eu besoin des mêmes : deux semis qui poseraient
 * leurs commandes chacun à sa façon finiraient par ne plus éprouver la même
 * chose.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Qui a colisé, qui a remis — au journal comme sur l'attestation.
 *
 * Le même sujet que l'activation de la société (`client.seed.ts`) : un semis qui
 * attesterait anonymement mentirait sur l'auteur, et l'agrégat refuse de toute
 * façon un auteur vide.
 */
export const SEED_STAFF_SUB = "seed|dev";

/** Les initiales du semis sur les coches — deux lettres, comme au crayon. */
const SEED_INITIALS = "SD";

/** Le minimum dont le semis de commandes a besoin : la base, le bus, et de quoi dater. */
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
  /**
   * La fiche staff de QUI a demandé le semis — le livreur de la tournée
   * chargée. Absente en ligne de commande : personne à qui l'affecter.
   */
  readonly requester?: string | undefined;
  /**
   * **Laisse la boîte d'envoi livrer ce qui est en vol** — et rend la main quand
   * plus rien ne l'est.
   *
   * Depuis la bascule du colisage (K2, 2026-10-04), le poste se nourrit de
   * faits : la liste à coliser part à la clôture, chaque fournée est une
   * remise. Sans cette attente, le semis mettait au bac une commande que le
   * colisage n'avait pas encore reçue, et le refus (`packing.order.not_drawn_yet`)
   * aurait été juste.
   */
  readonly settle: () => Promise<void>;
}

/** Une adresse du carnet : son identité, et l'instantané postal que la commande fige. */
export interface CarnetAddress {
  readonly id: string;
  readonly postal: BillingAddressPayload;
}

export interface Target {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupAddressId: string | null;
  /**
   * Les points de retrait **par libellé** — la file du comptoir en vise deux.
   *
   * Par libellé et non par rang : `findMany` ne promet aucun ordre, et « le
   * second point » aurait désigné celui que la base rendait ce jour-là.
   */
  readonly pickupIds: ReadonlyMap<string, string>;
  /** L'adresse de livraison **par défaut** du carnet, quand il y en a une. */
  readonly defaultDelivery: CarnetAddress | null;
  /** Toutes les adresses de livraison du carnet, par libellé — « Le Chalet » en est une. */
  readonly deliveries: ReadonlyMap<string, CarnetAddress>;
}

/** Une ligne de panier, par SKU de produit. */
export interface SeedLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Une tranche horaire demandée ; `start` nul = une échéance (« avant `end` »). */
export interface SeedWindow {
  readonly start: string | null;
  readonly end: string;
}

/** Ce qu'il faut pour poser une commande. */
export interface SeedOrder {
  readonly at: Date;
  readonly forDay: string;
  readonly method: "pickup" | "delivery";
  /** Le point de retrait par libellé ; `null` = celui par défaut. */
  readonly point: string | null;
  /** La tranche demandée ; `null` = aucune, et la clé est alors OMISE. */
  readonly window: SeedWindow | null;
  readonly lines: readonly SeedLine[];
  readonly paid: boolean;
  /**
   * L'adresse du carnet visée, par libellé ; absente = celle par défaut. Le
   * client de référence se fait livrer « Le Chalet », qui ne l'est pas.
   */
  readonly deliveryLabel?: string;
}

/** Une commande posée : son identifiant (la clé de la livraison) et son numéro (celle du fournil). */
export interface PlacedOrder {
  readonly id: string;
  readonly reference: string;
}

/** Le contexte de requête d'un geste staff — sans lui, aucun handler ne sait qui agit. */
export function asStaff<T>(now: Date, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now, traceId: newTraceId(), actor: { type: "staff", id: SEED_STAFF_SUB } },
    run,
  );
}

/** La société, son acheteur, ses points de retrait et son carnet de livraison. */
export async function resolveTarget(
  context: SeedContext,
  raisonSociale: string = CLIENT_RAISON_SOCIALE,
): Promise<Target> {
  const company = await context.prisma.company.findFirst({
    where: { raisonSociale },
    select: { id: true },
  });
  if (company === null) {
    throw new Error(`Société « ${raisonSociale} » absente : semer le client avant ses commandes.`);
  }
  const member = await context.prisma.membership.findFirst({
    where: { companyId: company.id },
    select: { userId: true },
  });
  if (member === null) {
    throw new Error(`La société « ${raisonSociale} » n'a aucun membre : rien à qui porter.`);
  }
  const labo = await context.prisma.pickupAddress.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  const points = await context.prisma.pickupAddress.findMany({ select: { id: true, label: true } });
  const carnet = await readCarnet(context, company.id);
  return {
    companyId: company.id,
    buyerUserId: member.userId,
    // `null` = le point par DÉFAUT, résolu par le domaine. On le passe explicite
    // quand il existe pour que la commande fige le bon libellé.
    pickupAddressId: labo?.id ?? null,
    pickupIds: new Map(points.map((point) => [point.label, point.id])),
    defaultDelivery: carnet.defaultDelivery,
    deliveries: carnet.deliveries,
  };
}

/**
 * **Le carnet de livraison, tel que la boutique le lit.**
 *
 * 🔴 Régression du 2026-09-29 : le semis figeait l'adresse de La Daille sur
 * TOUTES les livraisons, quel que soit le client — une constante postale
 * recopiée du client de référence. Le Petit Chaudron se faisait donc livrer au
 * sommet d'un téléphérique, et la feuille de route montrait dix arrêts au même
 * endroit. La boutique, elle, fige l'adresse du carnet du client : c'est ce que
 * le semis fait désormais, identité et instantané ensemble.
 */
async function readCarnet(
  context: SeedContext,
  companyId: string,
): Promise<Pick<Target, "defaultDelivery" | "deliveries">> {
  const rows = await context.prisma.address.findMany({
    where: { companyId, kind: "delivery", archivedAt: null },
    select: {
      id: true,
      isDefault: true,
      label: true,
      ligne1: true,
      ligne2: true,
      codePostal: true,
      ville: true,
      pays: true,
    },
  });
  const addresses = rows.map((row) => ({
    isDefault: row.isDefault,
    address: {
      id: row.id,
      postal: {
        label: row.label,
        ligne1: row.ligne1,
        ligne2: row.ligne2,
        codePostal: row.codePostal,
        ville: row.ville,
        pays: row.pays,
      },
    },
  }));
  return {
    defaultDelivery: addresses.find((entry) => entry.isDefault)?.address ?? null,
    deliveries: new Map(addresses.map((entry) => [entry.address.postal.label, entry.address])),
  };
}

/** L'adresse du carnet que vise une livraison — refusée plutôt qu'inventée si elle manque. */
function carnetAddressOf(target: Target, order: SeedOrder): CarnetAddress {
  const address =
    order.deliveryLabel === undefined
      ? target.defaultDelivery
      : (target.deliveries.get(order.deliveryLabel) ?? null);
  if (address === null) {
    throw new Error(
      `Aucune adresse de livraison « ${order.deliveryLabel ?? "par défaut"} » au carnet de la ` +
        "société : semer ses adresses avant ses livraisons.",
    );
  }
  return address;
}

/**
 * Pose une commande par le vrai handler, recale sa date de création, et rend
 * son identifiant et son **numéro** — la clé par laquelle le colisage et la
 * remise la reprennent.
 */
export async function place(
  context: SeedContext,
  target: Target,
  order: SeedOrder,
): Promise<PlacedOrder> {
  const pickupAddressId =
    order.point === null ? target.pickupAddressId : (target.pickupIds.get(order.point) ?? null);
  if (order.point !== null && pickupAddressId === null) {
    throw new Error(
      `Point de retrait « ${order.point} » absent : semer la station avant les commandes.`,
    );
  }
  const delivery = order.method === "delivery" ? carnetAddressOf(target, order) : null;
  const payload: PlaceOrderPayload = {
    // Chaque commande du semis est une tentative DISTINCTE : une clé par
    // commande, sinon la seconde serait rendue comme un rejeu de la première et
    // le semis poserait une seule ligne au lieu de son historique.
    idempotencyKey: randomUUID(),
    // Le semis ne choisit pas son règlement : il laisse le serveur décider comme
    // il l'a toujours fait — au compte si les termes sont accordés, carte sinon.
    settlement: null,
    fulfillmentMethod: order.method,
    deliveryAddress: delivery?.postal ?? null,
    // L'IDENTITÉ de l'adresse, en plus de son instantané postal : sans elle le
    // serveur ne sait pas de quelles consignes de site la commande s'écarte.
    deliveryAddressId: delivery?.id ?? null,
    pickupAddressId: order.method === "pickup" ? pickupAddressId : null,
    // En RETRAIT la tranche se demande explicitement ; en LIVRAISON elle vient
    // du carnet, que `defaultsFor` lit à partir de `deliveryAddressId`.
    //
    // ⚠️ La tranche doit tenir dans UNE fenêtre d'ouverture du point, jamais
    // dans leur union — le serveur refuse sinon, et il a raison : entre le
    // créneau pro et l'ouverture publique du Labo, il y a porte close.
    //
    // 🔴 **`undefined` et `null` ne disent PAS la même chose** : `agreeFulfillment`
    // lit l'absence comme « prends le défaut » et un `null` explicite comme « le
    // client n'en veut aucune ». Envoyer `null` en livraison ÉCRASAIT donc la
    // fenêtre du carnet. La clé est omise, pas mise à `null`.
    ...(order.window === null ? {} : { requestedWindow: order.window }),
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
        // Le semis passe la société EXPLICITEMENT : il n'y a pas de requête HTTP
        // derrière lui, donc pas de guard pour la résoudre.
        new PlaceOrderCommand(target.buyerUserId, payload, target.companyId),
      ),
  );
  const row = await context.prisma.order.update({
    where: { id: placed.id },
    data: {
      createdAt: order.at,
      ...(order.paid ? { paymentStatus: PaymentStatus.paid } : {}),
    },
    select: { orderNumber: true },
  });
  return { id: placed.id, reference: row.orderNumber };
}

/** Un sac : le contenant d'un retrait, qui naît et vit au colisage. */
export const ONE_BAG: readonly OpenPackingContainer[] = [{ nature: "bag" }];

/**
 * **La commande, faite comme au fournil** : chaque produit coché en fournée
 * (une fois par jour), ses contenants ouverts au colisage, chaque ligne glissée
 * dedans, la commande déclarée prête. Lu dans la liste à coliser : ce sont SES
 * lignes qu'on pose, pas celles du panier.
 *
 * Depuis K3c (`plan-domaine-colisage.md` §17.3), plus d'ancien poste : une
 * livraison ouvre ses bacs au colisage (`containers`), qui les fait naître
 * chez la livraison ; un retrait, un sac. Une commande `counted` n'est plus
 * colisable — le semis n'en produit pas.
 *
 * @param baked les produits déjà cochés en fournée ce jour — PARTAGÉ entre le
 *   comptoir et la livraison du même jour : une ligne de fournée ne se coche
 *   qu'une fois.
 * @param containers les contenants à ouvrir, dans l'ordre ; les lignes s'y
 *   répartissent une par une, à tour de rôle.
 */
export async function packFully(
  context: SeedContext,
  serviceDay: string,
  reference: string,
  baked: Set<string>,
  containers: readonly OpenPackingContainer[] = ONE_BAG,
): Promise<void> {
  const lines = await context.prisma.productionOrderLine.findMany({
    where: { order: { serviceDay, reference } },
    select: { sku: true },
  });
  for (const { sku } of lines) {
    if (!baked.has(sku)) {
      await context.commands.execute(
        new MarkWorksheetLineCommand(serviceDay, sku, SEED_INITIALS, SEED_STAFF_SUB),
      );
      baked.add(sku);
    }
  }
  // Les fournées sont des remises : le colisage doit les avoir reçues, et la
  // liste à coliser avec elles, avant qu'une ligne entre au bac (K2).
  await context.settle();
  const orderId = await packIntoContainers(context, serviceDay, reference, containers);
  await context.commands.execute(new ClosePackingOrderCommand(serviceDay, orderId, SEED_STAFF_SUB));
  // La fermeture rend la commande prête par un fait : le commerce doit l'avoir
  // lu avant que la suite du semis (retrait, tournée) ne s'appuie dessus.
  await context.settle();
}

/**
 * Ouvre les contenants de la commande au colisage, et y glisse ses lignes —
 * entières, à tour de rôle. Rend l'identifiant opaque de la commande.
 */
async function packIntoContainers(
  context: SeedContext,
  serviceDay: string,
  reference: string,
  containers: readonly OpenPackingContainer[],
): Promise<string> {
  const order = await context.prisma.packingOrder.findFirst({
    where: { serviceDay, reference, containerMode: "listed" },
    select: { orderId: true, lines: { select: { sku: true, quantity: true } } },
  });
  if (order === null || containers.length === 0) {
    throw new Error(
      `La commande ${reference} n'est pas au colisage du ${serviceDay} en mode « listé », ` +
        "ou le semis ne lui donne aucun contenant : relancer le semis depuis une base vidée.",
    );
  }
  const opened: string[] = [];
  for (const request of containers) {
    opened.push(
      await context.commands.execute<OpenPackingContainerCommand, string>(
        new OpenPackingContainerCommand(serviceDay, order.orderId, request, SEED_STAFF_SUB),
      ),
    );
  }
  for (const [index, line] of order.lines.entries()) {
    const containerId = opened[index % opened.length];
    if (containerId === undefined) {
      throw new Error(`La commande ${reference} n'a aucun contenant ouvert.`);
    }
    await context.commands.execute(
      new AllocateToContainerCommand(
        serviceDay,
        order.orderId,
        containerId,
        line.sku,
        line.quantity,
        SEED_STAFF_SUB,
      ),
    );
  }
  return order.orderId;
}

/**
 * Le même jour, à l'heure dite.
 *
 * ⚠️ **`setHours` et non une soustraction de millisecondes.** Retrancher des
 * multiples de 24 h traverse un changement d'heure, et la journée obtenue glisse
 * alors d'une heure — c'est ce glissement qui avait produit dix doublons dans le
 * seed témoin.
 */
export function atHour(date: Date, hour: number, minute = 0): Date {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

/** Le jour décalé, l'heure reposée — cf. {@link atHour}. */
export function shiftDays(from: Date, days: number): Date {
  return atHour(new Date(from.getTime() + days * DAY_MS), from.getHours());
}

export function isoDay(date: Date): string {
  // Composé à la main : `toISOString` bascule en UTC et rend la veille pour
  // toute heure locale avant 02 h en été.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
