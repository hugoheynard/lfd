/**
 * **L'ordre des refus, sur chaque porte** — lot L4 du plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md` (§2.4, G3).
 *
 * `pricing-golden-master-refusals.ts` mesure l'ordre sur la seule saisie de
 * l'équipe. Ici, les MÊMES paires se rejouent sur les trois passations (le
 * client dans son espace, l'invité de la boutique, l'équipe) et sur
 * l'estimation de la saisie, qui compose par le même chemin. Une paire dit :
 * le panier qui viole deux règles rend le code de celle que le §2.4 range en
 * premier — le même code que le panier qui ne viole qu'elle.
 *
 * Les rangs mesurés, numérotés comme au §2.4 :
 * 0 (le lien au comptoir), 2 (la marque de l'équipe), 3 (le jour), 4 (le
 * chargement), 5 (l'heure limite), 7 bis (le total vu), 8 (le crédit).
 * À appeler APRÈS `refusalOrderCases` : son heure limite (J+1 fermé) est posée.
 */
import { randomUUID } from "node:crypto";

import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { agentsFor, contentOf, staffBody, type Agents } from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import { placed, type Paths } from "./pricing-golden-master-paths.js";
import { fromEstimate, type Recorded } from "./pricing-golden-master-record.js";
import type { RefusalOrder } from "./pricing-golden-master-refusals.js";
import {
  anchoredDay,
  BUYER_SUB,
  NO_CREDIT_SUB,
  type GoldenScene,
  type ScenePro,
} from "./pricing-golden-master-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/** Un total qu'aucune commande du corpus n'atteint : le total vu est faux. */
const UNSEEN_TOTAL = { expectedTotalCents: 1 } as const;

/** Les deux paniers des cas fixes : le panier sain, et le même avec un SKU inconnu. */
export interface RefusalBaskets {
  readonly fixed: GoldenBasket;
  readonly withUnknown: GoldenBasket;
}

/** Une variante : le panier, le jour, et ce que le corps porte en plus. */
interface Variant {
  readonly basket: GoldenBasket;
  readonly day: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

type Place = (variant: Variant) => Promise<Recorded>;

/** Les paires communes à toute porte : jour (3), chargement (4), heure limite (5), total vu (7 bis). */
function commonVariants(baskets: RefusalBaskets): Readonly<Record<string, Variant>> {
  const week = anchoredDay(7);
  return {
    "unknown-sku.only": { basket: baskets.withUnknown, day: week },
    "same-day.only": { basket: baskets.fixed, day: anchoredDay(0) },
    "same-day+unknown-sku": { basket: baskets.withUnknown, day: anchoredDay(0) },
    "cutoff-closed.only": { basket: baskets.fixed, day: anchoredDay(1) },
    "cutoff-closed+unknown-sku": { basket: baskets.withUnknown, day: anchoredDay(1) },
    "unseen-total+unknown-sku": { basket: baskets.withUnknown, day: week, extra: UNSEEN_TOTAL },
  };
}

const COMMON_ORDERS: readonly Omit<RefusalOrder, "label">[] = [
  { first: "same-day+unknown-sku", over: "same-day.only" },
  { first: "cutoff-closed+unknown-sku", over: "unknown-sku.only" },
];

/** Le total vu (7 bis) se tait devant le chargement (4) : « un refus d'un rang inférieur parle seul ». */
const SEEN_TOTAL_ORDER: Omit<RefusalOrder, "label"> = {
  first: "unseen-total+unknown-sku",
  over: "unknown-sku.only",
};

async function recordAll(
  prefix: string,
  variants: Readonly<Record<string, Variant>>,
  place: Place,
): Promise<Paths> {
  const paths: Paths = {};
  for (const [key, variant] of Object.entries(variants)) {
    paths[`${prefix}.${key}`] = await place(variant);
  }
  return paths;
}

function ordersOf(
  prefix: string,
  pairs: readonly Omit<RefusalOrder, "label">[],
): readonly RefusalOrder[] {
  return pairs.map(({ first, over }) => ({
    label: `${prefix} : ${first} → ${over}`,
    first: `${prefix}.${first}`,
    over: `${prefix}.${over}`,
  }));
}

/** Le client dans son espace (`POST /orders`), pour la société `pro` vue par `sub`. */
function clientPlace(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): (sub: string, pro: ScenePro, settlement: "account" | "card") => Place {
  return (sub, pro, settlement) =>
    async ({ basket, day, extra }) =>
      placed(
        ctx,
        await http
          .as(sub, pro.companyId)
          .post("/orders")
          .send({
            idempotencyKey: randomUUID(),
            salesTerms: null,
            settlement,
            ...contentOf(scene, basket, "pro", basket.lines, pro),
            requestedDeliveryDate: day,
            ...extra,
          }),
      );
}

async function clientPaths(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
  baskets: RefusalBaskets,
): Promise<{ readonly paths: Paths; readonly orders: readonly RefusalOrder[] }> {
  const place = clientPlace(ctx, scene, http);
  const own = place(BUYER_SUB, scene.pro, "account");
  const noCredit = place(NO_CREDIT_SUB, scene.proWithoutCredit, "account");
  const week = anchoredDay(7);
  const paths: Paths = {
    ...(await recordAll("client", commonVariants(baskets), own)),
    "client.no-credit.only": await noCredit({ basket: baskets.fixed, day: week }),
    "client.no-credit+unknown-sku": await noCredit({ basket: baskets.withUnknown, day: week }),
    "client.no-credit+unseen-total": await noCredit({
      basket: baskets.fixed,
      day: week,
      extra: UNSEEN_TOTAL,
    }),
    "client.unseen-total.only": await own({
      basket: baskets.fixed,
      day: week,
      extra: UNSEEN_TOTAL,
    }),
  };
  return {
    paths,
    orders: ordersOf("client", [
      ...COMMON_ORDERS,
      SEEN_TOTAL_ORDER,
      { first: "no-credit+unknown-sku", over: "unknown-sku.only" },
      // Le total vu (7 bis) AVANT le crédit (8) : aucune intention sans commande.
      { first: "no-credit+unseen-total", over: "unseen-total.only" },
    ]),
  };
}

/**
 * L'invité de la boutique (`POST /shop/orders`) : une adresse cliente par
 * passation, le limiteur de l'invité comptant 5 par minute et par adresse.
 */
async function guestPaths(
  ctx: E2eContext,
  scene: GoldenScene,
  baskets: RefusalBaskets,
  ipOf: (index: number) => string,
): Promise<{ readonly paths: Paths; readonly orders: readonly RefusalOrder[] }> {
  let sequence = 0;
  const place: Place = async ({ basket, day, extra }) => {
    sequence += 1;
    return placed(
      ctx,
      await agentsFor(ctx, ipOf(sequence))
        .anonymous()
        .post("/shop/orders")
        .send({
          idempotencyKey: randomUUID(),
          salesTerms: null,
          buyer: {
            firstName: "Camille",
            email: `ordre-${String(sequence)}@visiteur.fr`,
            phone: "0600000000",
          },
          ...contentOf(scene, basket, "individual"),
          requestedDeliveryDate: day,
          ...extra,
        }),
    );
  };
  return {
    paths: await recordAll("guest", commonVariants(baskets), place),
    orders: ordersOf("guest", [...COMMON_ORDERS, SEEN_TOTAL_ORDER]),
  };
}

/**
 * La saisie de l'équipe (`POST /admin/orders`) et son estimation : le lien au
 * comptoir (0) et la marque (2) parlent avant le jour et le chargement ; le
 * total vu (7 bis) avant le crédit (8). L'estimation n'a ni total vu ni
 * crédit refusé (ce dernier est un avertissement) : elle rejoue le reste.
 */
async function staffPaths(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
  baskets: RefusalBaskets,
): Promise<{ readonly paths: Paths; readonly orders: readonly RefusalOrder[] }> {
  const bodyOf = (pro: ScenePro, settlement: "account" | "link", variant: Variant) => ({
    ...staffBody(scene, variant.basket, settlement),
    companyId: pro.companyId,
    buyerUserId: pro.buyerUserId,
    requestedDeliveryDate: variant.day,
    ...variant.extra,
  });
  const admin =
    (pro: ScenePro, settlement: "account" | "link"): Place =>
    async (variant) =>
      placed(
        ctx,
        await http
          .as(E2E_STAFF_SUB)
          .post("/admin/orders")
          .set(INTENT_KEY, freshIntent())
          .send(bodyOf(pro, settlement, variant)),
      );
  const estimate: Place = async (variant) =>
    fromEstimate(
      await http
        .as(E2E_STAFF_SUB)
        .post("/admin/orders/estimate")
        .send(bodyOf(scene.pro, "account", variant)),
    );
  const own = admin(scene.pro, "account");
  const noCredit = admin(scene.proWithoutCredit, "account");
  const week = anchoredDay(7);
  const counter = { entryOrigin: "counter" } as const;
  const shortcut = { entryShortcut: "immediate_pickup" } as const;
  const ranked: Readonly<Record<string, Variant>> = {
    "counter-link.only": { basket: baskets.fixed, day: week, extra: counter },
    "counter-link+same-day+unknown-sku": {
      basket: baskets.withUnknown,
      day: anchoredDay(0),
      extra: counter,
    },
  };
  const commonForStaff = commonVariants(baskets);
  const estimateVariants = Object.fromEntries(
    Object.entries(commonForStaff).filter(([key]) => !key.startsWith("unseen-total")),
  );
  const paths: Paths = {
    ...(await recordAll("staff", ranked, admin(scene.pro, "link"))),
    ...(await recordAll("staff", commonForStaff, own)),
    "staff.shortcut-off-shelf.only": await own({
      basket: baskets.fixed,
      day: week,
      extra: shortcut,
    }),
    "staff.shortcut-off-shelf+same-day+unknown-sku": await own({
      basket: baskets.withUnknown,
      day: anchoredDay(0),
      extra: shortcut,
    }),
    "staff.unseen-total.only": await own({
      basket: baskets.fixed,
      day: week,
      extra: UNSEEN_TOTAL,
    }),
    "staff.no-credit+unseen-total": await noCredit({
      basket: baskets.fixed,
      day: week,
      extra: UNSEEN_TOTAL,
    }),
    ...(await recordAll("estimate", estimateVariants, estimate)),
  };
  return {
    paths,
    orders: [
      ...ordersOf("staff", [
        ...COMMON_ORDERS,
        SEEN_TOTAL_ORDER,
        { first: "counter-link+same-day+unknown-sku", over: "counter-link.only" },
        { first: "shortcut-off-shelf+same-day+unknown-sku", over: "shortcut-off-shelf.only" },
        { first: "no-credit+unseen-total", over: "unseen-total.only" },
      ]),
      ...ordersOf("estimate", COMMON_ORDERS),
    ],
  };
}

/** Les paires de chaque porte, enregistrées pour l'instantané. */
export async function refusalOrderOnEveryPath(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
  baskets: RefusalBaskets,
  guestIpOf: (index: number) => string,
): Promise<{ readonly paths: Paths; readonly orders: readonly RefusalOrder[] }> {
  const parts = [
    await clientPaths(ctx, scene, http, baskets),
    await guestPaths(ctx, scene, baskets, guestIpOf),
    await staffPaths(ctx, scene, http, baskets),
  ];
  return {
    paths: Object.fromEntries(parts.flatMap((part) => Object.entries(part.paths))),
    orders: parts.flatMap((part) => part.orders),
  };
}
