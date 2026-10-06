import type { S3StorageConfig } from "@lfd/storage";

import { STILL_SOLD } from "../../b2b/catalog/infrastructure/sellable-filter.js";
import { purgeScenario, type ScenarioPurgeReport } from "../scenario/purge/scenario-purge.js";
import { resolveScenarioScope } from "../scenario/purge/scenario-scope.js";
import { COUNTER, PICKUP_WINDOW } from "./counter-day.seed.js";
import { PEAK_AHEAD, placePeak, placeTomorrow, TOMORROW } from "./ahead-days.seed.js";
import { seedDeliverySettings } from "./delivery-settings.seed.js";
import type { DeliveryDayReport } from "./delivery-day.seed.js";
import { CORPUS_SKUS, HISTORY_COUNT, HISTORY_EVERY_DAYS, linesFor } from "./order-lines.seed.js";
import { isoDay, place, type SeedContext, type SeedLine, shiftDays } from "./order-placing.seed.js";
import {
  advanceToday,
  closeTodayPlan,
  placeToday,
  type ScenarioDay,
  scenarioDayOf,
} from "./today.seed.js";
import { placeTomorrowRounds, TOMORROW_ROUNDS_SKUS } from "./tomorrow-rounds.seed.js";
import { prepareClients, type ScenarioClients } from "./scenario-clients.seed.js";

export type { SeedContext } from "./order-placing.seed.js";

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
 * | **aujourd'hui** | la file du comptoir — cf. {@link COUNTER} |
 * | **demain** | deux commandes en attente — une en LIVRAISON, une en RETRAIT, et **tout le catalogue** réparti entre les deux (cf. {@link spreadLines}) |
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
 * ⚠️ Les commandes **de ces clients** sont effacées puis reposées. C'est la seule
 * façon de tenir « toujours » : garder les anciennes accumulerait, à chaque
 * exécution, une commande de plus pour un lendemain révolu. La suppression est
 * bornée par les clients et les journées du scénario (`purgeScenario`, depuis
 * le 2026-10-05 : tout ce que le scénario a créé, et seulement cela) — le
 * catalogue, la station et le référentiel ne sont jamais touchés.
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

/** Ce que le scénario a posé, jour par jour. */
export interface PlacedScenario {
  readonly placed: number;
  readonly yesterday: string;
  readonly today: string;
  /** Combien de lignes la file de remise porte aujourd'hui, tous points confondus. */
  readonly counterToday: number;
  /** Demain, laissé ouvert pour qu'on arrête son plan à l'écran. */
  readonly tomorrow: string;
  readonly tomorrowCount: number;
  /**
   * La journée des deux commandes en attente — **J+2 depuis le 2026-09-17**, et
   * le pic du prévisionnel. Cf. le bloc qui les pose pour la raison du décalage.
   */
  readonly peakDay: string;
}

/** La remise à l'état de base : ce qui est parti, ce qui est reposé. */
export interface ScenarioResetResult extends PlacedScenario {
  readonly purge: ScenarioPurgeReport;
}

/** Ce que le semis complet a posé — de quoi le raconter à qui l'a demandé. */
export interface OrdersReport extends ScenarioResetResult {
  /** La journée de livraison d'aujourd'hui, telle que les écrans la montreront. */
  readonly delivery: DeliveryDayReport;
}

/**
 * **Le scénario entier, d'une traite** : la remise à l'état de base, puis les
 * étapes de la journée — ce que font `pnpm seed:orders`, « Recharger les
 * commandes » et « Tout recharger ». Même code que les étapes une à une
 * (`documentation/order/plan-jeu-de-donnees-par-etapes.md` §2).
 *
 * @param buckets les buckets où des pièces du scénario peuvent dormir ; vides
 *   en ligne de commande, qui ne touche pas au stockage.
 */
export async function seedOrders(
  context: SeedContext,
  buckets: ScenarioBucketsInput = NO_BUCKETS,
): Promise<OrdersReport> {
  const reset = await resetScenario(context, buckets);
  const day = scenarioDayOf(context.now);
  await closeTodayPlan(context, day);
  const delivery = await advanceToday(context, day);
  return { ...reset, delivery };
}

/** Les buckets, tels que l'appelant les a résolus — `null` = non configuré. */
export interface ScenarioBucketsInput {
  readonly customers: S3StorageConfig | null;
  readonly production: S3StorageConfig | null;
}

const NO_BUCKETS: ScenarioBucketsInput = { customers: null, production: null };

/**
 * **Étape 0 — la remise à l'état de base** : les clients reposés (idempotent),
 * tout ce que le scénario avait créé supprimé (`purgeScenario`), puis toutes
 * les commandes reposées par les vrais gestes — hier, aujourd'hui, demain, J+2.
 * Le fournil, le colisage et les tournées du jour restent vides : ce sont les
 * étapes suivantes.
 */
export async function resetScenario(
  context: SeedContext,
  buckets: ScenarioBucketsInput,
): Promise<ScenarioResetResult> {
  // Ce qui est en vol d'une étape précédente doit avoir fini d'écrire : un
  // abonné qui écrirait APRÈS la purge laisserait sa ligne derrière elle.
  await context.settle();
  await ensureSkusExist(context);
  const clients = await prepareClients(context);
  // Les réglages de livraison AVANT les commandes : « Proposer » sur demain
  // doit répondre dès la remise à l'état de base (`delivery-settings.seed.ts`).
  await seedDeliverySettings(context);
  const day = scenarioDayOf(context.now);
  const scope = await resolveScenarioScope(context.prisma, clients.companyIds, [
    isoDay(shiftDays(day.today, -1)),
    day.forDay,
    isoDay(shiftDays(day.today, 1)),
    isoDay(shiftDays(day.today, PEAK_AHEAD)),
  ]);
  const purge = await purgeScenario(context.prisma, scope, buckets);
  const placed = await placeScenario(context, clients, day);
  return { ...placed, purge };
}

/** Toutes les commandes du scénario, posées par le vrai handler, du plus ancien au plus récent. */
async function placeScenario(
  context: SeedContext,
  clients: ScenarioClients,
  day: ScenarioDay,
): Promise<PlacedScenario> {
  const { today } = day;
  const target = clients.counter[0];
  if (target === undefined) {
    throw new Error("Client de référence absent du scénario.");
  }
  let placed = 0;

  // L'historique, du plus ancien au plus récent.
  for (let step = HISTORY_COUNT; step >= 1; step -= 1) {
    const at = shiftDays(today, -step * HISTORY_EVERY_DAYS);
    await place(context, target, {
      at,
      // Retrait le lendemain de la commande : la règle du parcours réel.
      forDay: isoDay(shiftDays(at, 1)),
      method: "pickup",
      point: null,
      window: PICKUP_WINDOW,
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
    point: null,
    window: PICKUP_WINDOW,
    lines: linesFor(0),
    paid: false,
  });

  // 🔴 AUJOURD'HUI — la file du comptoir, sur les deux points, et la journée
  // de livraison. Posées seulement : la suite est faite d'étapes.
  const todayCount = await placeToday(context, clients, day, await wideLines(context));
  await placeTomorrow(context, clients.counter, today);
  // Et les tournées de demain : trois camionnettes, par la place au sol.
  const tomorrowRounds = await placeTomorrowRounds(context, clients.byEnseigne, today);
  await placePeak(context, target, {
    today,
    halves: [await spreadLines(context, 0), await spreadLines(context, 1)],
  });

  return {
    placed: placed + 1 + todayCount + TOMORROW.length + tomorrowRounds + 2,
    yesterday: isoDay(shiftDays(today, -1)),
    today: day.forDay,
    counterToday: COUNTER.length,
    tomorrow: isoDay(shiftDays(today, 1)),
    tomorrowCount: TOMORROW.length + tomorrowRounds,
    peakDay: isoDay(shiftDays(today, PEAK_AHEAD)),
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
  const wanted = [...new Set([...CORPUS_SKUS, ...TOMORROW_ROUNDS_SKUS])];
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
 * Combien de références dans le sac long. Dix-huit : assez pour déborder la
 * carte sur un écran de portable comme sur un 27 pouces, et pas au point de
 * rendre la commande invraisemblable pour une maison qui en prend six.
 */
const WIDE_LINE_COUNT = 18;

/**
 * **Le sac long** — les lignes prises AU CATALOGUE, et non aux habitudes.
 *
 * 🔴 Lues en base plutôt qu'écrites ici : une liste de dix-huit SKU en dur se
 * périmerait au premier retrait d'article, et le semis échouerait alors sur une
 * référence que le catalogue ne vend plus — une panne du jeu de données pour un
 * changement qui n'a rien à voir avec lui. `STILL_SOLD` nomme la condition du
 * retrait une seule fois, et la porte `withdrawn-filter` refuse qu'on la
 * recopie.
 *
 * L'ordre est celui du SKU, pas celui que la base rend : `findMany` n'en promet
 * aucun, et deux exécutions poseraient sinon deux sacs différents.
 */
/**
 * **Tout le catalogue, étalé** — les lignes des journées qu'on regarde à l'écran.
 *
 * Le « sac long » ci-dessous fait dix-huit références et vise le rail de remise ;
 * celui-ci vise les GRANDES TABLES — la fiche d'atelier, le récapitulatif, la
 * matrice du prévisionnel. Une maison qui prend six références ne montre jamais
 * ce que fait une colonne à quarante lignes, ni un onglet de catégorie plein, ni
 * l'alignement tabulaire des quantités sur trois chiffres. Un comportement qu'on
 * ne peut pas voir est un comportement qu'on casse sans s'en apercevoir.
 *
 * ⚠️ **L'ordre est `categoryId` puis SKU**, et pas le SKU seul : trancher par
 * SKU donnerait deux moitiés dont la première ne contiendrait que des chocolats
 * et des pains. On veut que CHAQUE rayon soit fourni, puisque c'est un rayon que
 * la fiche d'atelier ouvre à la fois.
 *
 * @param skip combien de références sauter — de quoi donner deux moitiés
 *   complémentaires à deux commandes du même jour.
 */
async function spreadLines(context: SeedContext, skip: number): Promise<SeedLine[]> {
  const items = await context.prisma.catalogItem.findMany({
    // Hors opération datée : un article « seulement pendant une opération » est
    // refusé hors de ses jours (`orders.operation.day_outside`), et le semis
    // s'arrêtait sur la première bûche venue (constaté le 2026-09-28).
    where: { isDefault: true, operationOnly: false, ...STILL_SOLD },
    select: { productSku: true },
    orderBy: [{ categoryId: "asc" }, { productSku: "asc" }],
  });
  return items
    .filter((_, index) => index % 2 === skip)
    .map((item, index) => ({
      sku: item.productSku,
      // Déterministe, et sur trois ordres de grandeur : c'est là que se voit
      // l'alignement des chiffres monospacés, et le contenant qui bascule du
      // singulier au pluriel.
      quantity: 1 + ((index * 13) % 7) + (index % 5 === 0 ? 40 : 0) + (index % 11 === 0 ? 100 : 0),
    }));
}

async function wideLines(context: SeedContext): Promise<SeedLine[]> {
  const items = await context.prisma.catalogItem.findMany({
    // Hors opération datée : un article « seulement pendant une opération » est
    // refusé hors de ses jours (`orders.operation.day_outside`), et le semis
    // s'arrêtait sur la première bûche venue (constaté le 2026-09-28).
    where: { isDefault: true, operationOnly: false, ...STILL_SOLD },
    select: { productSku: true },
    orderBy: { productSku: "asc" },
    take: WIDE_LINE_COUNT,
  });
  if (items.length < WIDE_LINE_COUNT) {
    throw new Error(
      `Catalogue trop court pour le sac long : ${items.length} article(s) vendables, ` +
        `${WIDE_LINE_COUNT} attendus. Le miroir n'a peut-être jamais été poussé — ` +
        "lancer : pnpm --filter lfd-api seed:pim",
    );
  }
  // Des quantités qui varient sans hasard : deux exécutions du semis ne se
  // contredisent pas, et la colonne de gauche montre des nombres à une et à
  // deux chiffres — c'est là que se voit l'alignement tabulaire.
  return items.map((item, index) => ({
    sku: item.productSku,
    quantity: 2 + ((index * 7) % 23),
  }));
}
