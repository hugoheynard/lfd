import { STILL_SOLD } from "../../b2b/catalog/infrastructure/sellable-filter.js";
import { ConfirmManualHandoverCommand } from "../../handover/application/commands/confirm-manual-handover.command.js";
import { CloseProductionDayCommand } from "../../production/application/commands/close-production-day.command.js";
import { CLIENT_ENSEIGNE } from "./client.seed.js";
import { DELIVERY_CLIENTS, seedDeliveryClients } from "./delivery-clients.seed.js";
import { resetDeliveryRounds, type DeliveryRoundsResetReport } from "./delivery-rounds.seed.js";
import { NEIGHBOURS, seedNeighbourClients } from "./neighbour-clients.seed.js";
import { counterDeliveryContainers, seedBinTypes } from "./delivery-bins.seed.js";
import {
  advanceDeliveryDay,
  placeDeliveryDay,
  type DeliveryDayReport,
} from "./delivery-day.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  ONE_BAG,
  packFully,
  place,
  type PlacedOrder,
  resolveTarget,
  SEED_STAFF_SUB,
  type SeedContext,
  shiftDays,
  type Target,
} from "./order-placing.seed.js";
import { seedReturnedBatch } from "./packing-return.seed.js";
import { resetProduction, type ProductionResetReport } from "./production.seed.js";

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

/**
 * La tranche demandée sur une commande de RETRAIT au Labo.
 *
 * Elle tient dans le créneau **professionnel** (05:00–06:30), pas dans son
 * ouverture publique : c'est le cas qu'un jeu de données doit montrer, parce que
 * c'est celui qu'un client pro emprunte. Une fenêtre à cheval sur les deux
 * serait refusée — il y a porte close entre les deux.
 */
const PICKUP_WINDOW = { start: "05:30", end: "06:30" } as const;

/**
 * Les deux tranches du **Village**, qui n'ouvre qu'au public (08:00–18:00).
 *
 * Deux, et à des heures éloignées, pour une raison précise : l'écran de remise
 * ne parle de retard que sur une tranche `override`, et il le calcule contre
 * l'heure courante. Une seule tranche montrerait soit toujours un retard, soit
 * jamais — jamais les deux tons de ligne dans la même matinée.
 */
const VILLAGE_MORNING = { start: "09:00", end: "10:00" } as const;
const VILLAGE_AFTERNOON = { start: "14:00", end: "15:00" } as const;

/** Les deux points, par leur libellé — la clé sous laquelle la station les sème. */
const LABO = "Le Labo";
const VILLAGE = "Le Village";

/**
 * **Ce que le comptoir voit AUJOURD'HUI** — la file de remise, et le seul
 * endroit du semis qui la décrit.
 *
 * ## Pourquoi cette table, et pas trois commandes de plus
 *
 * L'écran de remise dérive ses onglets des `pickupLabel` **présents dans la
 * réponse**, et ses trois compteurs de l'onglet ouvert. Un seul point semé ne
 * produit qu'un onglet : on ne verrait jamais la bascule d'un point à l'autre,
 * ni que les compteurs la suivent.
 *
 * ⚠️ Cette phrase a justifié les deux points par l'onglet « Tous les points »,
 * qui n'existe plus depuis le 2026-09-11 — supprimé par le commit qui a
 * justement retouché ce bloc, sans toucher à cette ligne-là. La raison de semer
 * deux points, elle, tient toujours ; c'était son énoncé qui était périmé.
 *
 * ⚠️ La ligne en LIVRAISON y était pour la même raison, et ne l'est plus :
 * l'écran de remise ne montre que les retraits depuis le 2026-09-11. Elle est
 * gardée parce qu'une journée de service en comporte, et parce que l'écran qui
 * les portera en aura besoin.
 *
 * ## Les états sont ATTEINTS, jamais écrits
 *
 * `ready` passe par les gestes du colisage (`packFully`), `handed_over` par
 * `ConfirmManualHandoverCommand` — donc par `packingBlocker` et
 * `handoverBlocker`, et par la course que l'unicité en base arbitre. Un
 * `readyAt` posé à la main aurait peint le même écran en n'éprouvant rien, et
 * aurait survécu à une règle qui change.
 *
 * ⚠️ **`cancelled` manque, et ce n'est pas un oubli.** Aucune commande ne
 * s'annule par un handler aujourd'hui — les e2e qui ont besoin de cet état
 * écrivent la colonne en direct. Le semis ne le fera pas : il poserait un état
 * que le produit ne sait pas produire. Le jour où la commande d'annulation
 * existe, une ligne ici suffira.
 */
interface CounterOrder {
  /** Le point de retrait, par son libellé. `null` = le coursier passe. */
  readonly point: string | null;
  /** La tranche demandée, ou `null` : aucune n'a été demandée. */
  /** `start` nul = une échéance — la forme de toute livraison de la démo. */
  readonly window: { readonly start: string | null; readonly end: string } | null;
  /** L'état que la file doit montrer, atteint par les vraies commandes. */
  readonly outcome: "expected" | "ready" | "handed_over";
  /**
   * Le client, par rang : 0 = le client de référence, puis `NEIGHBOURS` dans
   * leur ordre. Aujourd'hui compte CINQ maisons (Hugo, 2026-09-28).
   */
  readonly client: number;
  /** L'heure du retrait quand il n'a pas lieu à l'heure du Labo (le Village ouvre à 8 h). */
  readonly handedOverHour?: number;
  /** L'échéance dont on reprend les lignes — cf. {@link linesFor}. */
  readonly step: number;
  /**
   * Prend le catalogue au large plutôt que les habitudes de la maison — cf.
   * {@link wideLines}. `step` est alors ignoré.
   */
  readonly wide?: boolean;
}

const COUNTER: readonly CounterOrder[] = [
  // Le Labo — le créneau pro, celui d'avant le four.
  { point: LABO, window: PICKUP_WINDOW, outcome: "handed_over", step: 0, client: 0 },
  // 🔴 **Le client qui n'est pas venu** : prête à 5 h, bien avant la fin de sa
  // tranche (6 h 30), et toujours là — la Supervision le compte « client pas
  // venu », en ambre (Hugo, 2026-09-28).
  { point: LABO, window: PICKUP_WINDOW, outcome: "ready", step: 1, client: 1 },
  // 🔴 **Sans tranche, et c'est de l'HISTORIQUE** — pas une lacune du semis.
  // Jusqu'au 2026-09-11, l'écran de saisie staff n'envoyait aucune tranche et un
  // retrait ne prend aucun défaut : TOUTE commande prise au téléphone arrivait
  // ici sans créneau. Le créneau y est désormais obligatoire, donc ce cas ne se
  // crée plus — mais il vit dans les données, et la file doit continuer de le
  // montrer. Elle le descend en fin de liste sans lui inventer d'heure, et ne
  // parle pas de son retard : on ne reproche pas une heure que personne n'a
  // donnée.
  //
  // ⚠️ Le retirer du semis ferait disparaître des postes de développement le
  // seul exemplaire d'un cas que le comptoir rencontrera pendant des mois.
  { point: LABO, window: null, outcome: "expected", step: 2, client: 0 },
  // Le Village — deux tranches, donc un onglet avec son propre compteur.
  // Retirée dans sa tranche : le Village a servi à l'heure.
  {
    point: VILLAGE,
    window: VILLAGE_MORNING,
    outcome: "handed_over",
    step: 3,
    client: 2,
    handedOverHour: 9,
  },
  // ⚠️ Après 15 h, elle devient à son tour un retard « par nous ».
  { point: VILLAGE, window: VILLAGE_AFTERNOON, outcome: "expected", step: 4, client: 3 },
  // 🔴 Une LIVRAISON du même jour. Elle ne paraît plus dans la file de remise
  // depuis le 2026-09-11 — le comptoir ne tend pas un sac qu'un coursier
  // emporte, et la livraison aura son propre écran. Elle reste semée pour lui,
  // et parce qu'une journée sans elle ne ressemblerait à aucune vraie journée.
  { point: null, window: null, outcome: "ready", step: 5, client: 0 },
  // 🔴 Le SAC LONG. Toutes les autres tiennent en six références ou moins, donc
  // aucun poste de développement ne voyait ce que fait le rail quand la liste
  // dépasse la place : elle défile DANS sa carte, sans repousser le bouton de
  // remise. Un comportement qu'on ne peut pas voir est un comportement qu'on
  // casse sans s'en apercevoir.
  //
  // 🔴 **Et le retard qui est le nôtre** : sa tranche finit à 6 h 30 et le sac
  // n'est pas fait — la Supervision le compte « pas prête à temps », en rouge.
  { point: LABO, window: PICKUP_WINDOW, outcome: "expected", step: 1, wide: true, client: 4 },
];

/**
 * L'heure du **plan du soir** de la veille : le geste qui arrête le compte du
 * jour. Le semis le joue pour aujourd'hui, pour que la fournée, la fiche
 * d'atelier et le colisage du jour soient ouverts dès le chargement.
 */
const EVENING_CLOSE_HOUR = 20;

/**
 * Demain : **trois clients**, un retrait par comptoir et une livraison — cf.
 * `seedOrders`. `client` est un rang : 0 = le client de référence, puis les
 * voisins de `NEIGHBOURS` dans leur ordre.
 *
 * Des paniers qui ne se recoupent PAS (Hugo, 2026-09-28) : chercher une
 * commande doit surligner SES produits en préparation, et deux paniers qui
 * portent le même croissant surligneraient le même rayon pour les deux.
 */
const TOMORROW: readonly (Pick<CounterOrder, "point" | "window"> & {
  readonly client: number;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
})[] = [
  {
    client: 0,
    point: LABO,
    window: PICKUP_WINDOW,
    lines: [
      { sku: "VIE-001", quantity: 30 },
      { sku: "PAI-001", quantity: 20 },
    ],
  },
  {
    client: 1,
    point: VILLAGE,
    window: VILLAGE_MORNING,
    lines: [
      { sku: "VIE-002", quantity: 24 },
      { sku: "VIE-005", quantity: 12 },
    ],
  },
  {
    client: 2,
    point: null,
    // L'Hôtel Le Lac Blanc porte deux échéances (09:00, 18:00) : la commande
    // dit laquelle — celle du dîner.
    window: { start: null, end: "18:00" },
    lines: [
      { sku: "PAI-013", quantity: 10 },
      { sku: "VIE-009", quantity: 36 },
    ],
  },
];
/** L'heure du colisage, et celle de la remise. Le sac sort avant de partir. */
const PACKED_HOUR = 5;
const HANDED_OVER_HOUR = 6;

/** Ce que le semis a posé — de quoi le raconter à qui l'a demandé. */
export interface OrdersReport {
  readonly removed: number;
  /** Ce que la coupe a emporté chez le fournil — plans et attestations. */
  readonly production: ProductionResetReport;
  /** Ce que la coupe a emporté à la livraison — tournées, arrêts, sacs. */
  readonly rounds: DeliveryRoundsResetReport;
  /** La journée de livraison d'aujourd'hui, telle que les écrans la montreront. */
  readonly delivery: DeliveryDayReport;
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

export async function seedOrders(context: SeedContext): Promise<OrdersReport> {
  const target = await resolveTarget(context);
  await ensureSkusExist(context);
  // Les voisins et les clients de la journée de livraison — semés ici,
  // idempotents, pour que la ligne de commande `seed:orders` suffise sans
  // rejouer tout le semis.
  await seedNeighbourClients(context);
  await seedDeliveryClients(context);
  const neighbours = await Promise.all(
    NEIGHBOURS.map((neighbour) => resolveTarget(context, neighbour.raisonSociale)),
  );
  const deliveryClients = await Promise.all(
    DELIVERY_CLIENTS.map((client) => resolveTarget(context, client.raisonSociale)),
  );
  const clients = [target, ...neighbours];
  const removed = await context.prisma.order.deleteMany({
    where: {
      companyId: { in: [...clients, ...deliveryClients].map((client) => client.companyId) },
    },
  });
  // 🔴 Le fournil AUSSI, et dans le même geste. Ses tables portent des copies de
  // ces commandes — un plan du soir, ses fiches, son compte à produire — que
  // rien ne rattache par clé étrangère : la coupe ci-dessus les laisserait
  // derrière, à parler de commandes qui n'existent plus. Cf. `production.seed`.
  const production = await resetProduction(context.prisma);
  // Et la livraison, pour la même raison : ses tournées désignent les commandes
  // par identifiant opaque, sans clé étrangère. Les véhicules restent.
  const rounds = await resetDeliveryRounds(context.prisma);
  const byEnseigne = new Map<string, Target>(
    [
      [CLIENT_ENSEIGNE, target],
      ...NEIGHBOURS.map((neighbour, rank) => [neighbour.enseigne, neighbours[rank]] as const),
      ...DELIVERY_CLIENTS.map((client, rank) => [client.enseigne, deliveryClients[rank]] as const),
    ].filter((entry): entry is readonly [string, Target] => entry[1] !== undefined),
  );

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
  // de livraison : ses commandes, ses sacs, sa flotte, sa tournée chargée.
  const delivery = await seedToday(context, clients, byEnseigne, today);

  // 🔴 **DEMAIN — le plan que l'on arrête ce soir** (Hugo, 2026-09-28).
  //
  // Le plan du soir arrête la prochaine journée À VENIR qui a des commandes.
  // Demain vide, il sautait au pic de J+2 : en démonstration, « arrêter le plan
  // du soir » arrêtait le surlendemain, et la suite du geste — fiche d'atelier,
  // fournée, colisage de demain — ne se montrait pas. Trois commandes, une par
  // acheminement et les deux comptoirs, laissées OUVERTES : c'est à l'équipe de
  // les arrêter, à l'écran.
  for (const order of TOMORROW) {
    const client = clients[order.client];
    if (client === undefined) {
      throw new Error(`Client de rang ${String(order.client)} absent du semis de demain.`);
    }
    await place(context, client, {
      at: today,
      forDay: isoDay(shiftDays(today, 1)),
      method: order.point === null ? "delivery" : "pickup",
      point: order.point,
      window: order.window,
      lines: order.lines,
      paid: false,
    });
  }

  // 🔴 **J+2 — et c'est le PIC** (Hugo, 2026-09-17).
  //
  // Deux en attente, une par mode d'acheminement, et **tout le catalogue**
  // réparti entre les deux. C'est la journée que la fiche d'atelier ouvre dès
  // qu'on arrête son plan : elle doit montrer ce que fait un rayon plein, pas
  // six références qui tiennent sans défiler.
  //
  // Deux moitiés COMPLÉMENTAIRES, et pas deux fois la même : le compte à
  // produire somme les commandes, et deux sacs identiques ne prouveraient pas
  // qu'il somme — ils doubleraient simplement chaque ligne.
  //
  // ## Pourquoi J+2 et non plus demain
  //
  // Le prévisionnel s'appelle « le mur qui arrive » : il sert à voir monter une
  // charge, pas à constater celle du jour. Tant que ces deux commandes tombaient
  // à J+1, le jour le plus chargé était AUJOURD'HUI — le comptoir et son sac
  // long — et l'écran ne montrait aucune montée. À J+2, la colonne teintée est
  // devant, et la fenêtre de sept jours la nomme (`J+2`).
  //
  // ⚠️ Elles ont été DÉPLACÉES de J+1, pas ajoutées. Demain a retrouvé des
  // commandes le 2026-09-28 (ci-dessus), mais pas le catalogue entier : le
  // rayon plein reste celui de J+2, et le pic avec lui.
  const PEAK_AHEAD = 2;
  await place(context, target, {
    at: today,
    forDay: isoDay(shiftDays(today, PEAK_AHEAD)),
    method: "delivery",
    point: null,
    window: null,
    lines: await spreadLines(context, 0),
    paid: false,
  });
  await place(context, target, {
    at: today,
    forDay: isoDay(shiftDays(today, PEAK_AHEAD)),
    method: "pickup",
    point: null,
    window: PICKUP_WINDOW,
    lines: await spreadLines(context, 1),
    paid: false,
  });

  return {
    removed: removed.count,
    production,
    rounds,
    delivery,
    placed: placed + 3 + COUNTER.length + delivery.deliveries + TOMORROW.length,
    yesterday: isoDay(shiftDays(today, -1)),
    today: isoDay(today),
    counterToday: COUNTER.length,
    tomorrow: isoDay(shiftDays(today, 1)),
    tomorrowCount: TOMORROW.length,
    peakDay: isoDay(shiftDays(today, PEAK_AHEAD)),
  };
}

/**
 * **Aujourd'hui : poser, arrêter le plan, avancer.**
 *
 * ## Pourquoi les commandes sont passées HIER
 *
 * L'heure limite du semis est « la veille 18 h, une heure de rattrapage ». Une
 * commande pour aujourd'hui passée ce matin serait donc **refusée** — à raison.
 * Elles sont posées à l'heure habituelle de la veille, ce qui est aussi le
 * parcours réel : on commande le jour d'avant pour retirer le matin.
 *
 * ## Pourquoi la livraison est posée AVANT le plan du soir
 *
 * Le plan du soir est un instantané : une commande posée après lui n'est pas au
 * plan, donc ni en fournée ni au colisage — la feuille de route la montrerait
 * sans sac possible. Comptoir ET livraison sont donc posés, puis le plan est
 * arrêté une fois, puis chacun avance.
 *
 * ## Et pourquoi l'avancement est daté, lui aussi
 *
 * Le colisage et la remise se jouent dans un contexte daté d'**aujourd'hui** :
 * le colisage prend l'instant du contexte, et l'attestation le lit à l'horloge
 * du contexte. Les dater de maintenant ferait apparaître la remise à l'heure du
 * semis — 14 h pour un sac parti à 6 h.
 */
async function seedToday(
  context: SeedContext,
  clients: readonly Target[],
  byEnseigne: ReadonlyMap<string, Target>,
  today: Date,
): Promise<DeliveryDayReport> {
  const forDay = isoDay(today);
  const orderedAt = shiftDays(today, -1);
  const counter = await placeCounter(context, clients, orderedAt, forDay);
  const deliveries = await placeDeliveryDay(context, byEnseigne, orderedAt, forDay);

  // 🔴 **Le plan du soir d'hier** — sans lui, la fournée du jour refuse chaque
  // coche (« la journée n'est pas arrêtée ») : le semis vide le fournil et
  // repose les commandes, mais personne n'avait arrêté leur journée
  // (constaté le 2026-09-28, en démonstration). Arrêté APRÈS la dernière
  // commande du jour et AVANT le colisage : l'ordre du fournil réel.
  await asStaff(atHour(orderedAt, EVENING_CLOSE_HOUR), () =>
    context.commands.execute(new CloseProductionDayCommand(forDay)),
  );

  // Les produits déjà cochés en fournée ce jour, comptoir et livraison
  // confondus : une ligne de fournée ne se coche qu'une fois.
  const baked = new Set<string>();
  // Les types de bacs AVANT le colisage : une livraison ouvre ses bacs au
  // colisage depuis K3c, celle du comptoir comprise.
  const binTypes = await seedBinTypes(context);
  await advanceCounter(context, counter, { today, baked, binTypes });
  // Une fournée de trop, reprise : l'annulation que le colisage tranche (K2).
  await asStaff(atHour(today, PACKED_HOUR), () => seedReturnedBatch(context, forDay));
  const counterDelivery = counter.find((placed) => placed.entry.point === null);
  return advanceDeliveryDay(context, {
    today,
    placed: deliveries,
    // La livraison du comptoir (La Daille) est déjà colisée ci-dessus : elle
    // rejoint la tournée de Val d'Isère sans repasser au colisage.
    alreadyPacked: counterDelivery === undefined ? [] : [counterDelivery.order],
    baked,
    binTypes,
  });
}

/** La file du comptoir, posée la veille. */
async function placeCounter(
  context: SeedContext,
  clients: readonly Target[],
  orderedAt: Date,
  forDay: string,
): Promise<readonly { readonly order: PlacedOrder; readonly entry: CounterOrder }[]> {
  const placed: { readonly order: PlacedOrder; readonly entry: CounterOrder }[] = [];
  for (const entry of COUNTER) {
    const client = clients[entry.client];
    if (client === undefined) {
      throw new Error(`Client de rang ${String(entry.client)} absent du comptoir du jour.`);
    }
    const order = await place(context, client, {
      at: orderedAt,
      forDay,
      method: entry.point === null ? "delivery" : "pickup",
      point: entry.point,
      window: entry.window,
      lines: entry.wide === true ? await wideLines(context) : linesFor(entry.step),
      paid: false,
    });
    placed.push({ order, entry });
  }
  return placed;
}

/** La file du comptoir, avancée par les gestes du fournil puis du comptoir. */
async function advanceCounter(
  context: SeedContext,
  counter: readonly { readonly order: PlacedOrder; readonly entry: CounterOrder }[],
  day: {
    readonly today: Date;
    readonly baked: Set<string>;
    readonly binTypes: ReadonlyMap<string, string>;
  },
): Promise<void> {
  const { today, baked } = day;
  const forDay = isoDay(today);
  const packedAt = atHour(today, PACKED_HOUR);
  for (const { order, entry } of counter) {
    if (entry.outcome === "expected") {
      continue;
    }
    // Le colisage d'abord, **y compris pour la remise** : un sac sort du fournil
    // avant de changer de mains, et `packingBlocker` refuse de déclarer prête
    // une commande déjà remise. L'ordre inverse marcherait une fois sur deux.
    // 🔴 **Par les gestes du fournil, pas par le statut** (2026-09-28). Cocher
    // en fournée, poser dans le bac et fermer le sac rend la commande prête par
    // l'événement du colisage — le chemin réel, donc un seul état partout.
    // Un sac au comptoir ; la livraison du comptoir, ses bacs (K3c).
    const containers = entry.point === null ? counterDeliveryContainers(day.binTypes) : ONE_BAG;
    await asStaff(packedAt, () => packFully(context, forDay, order.reference, baked, containers));
    if (entry.outcome === "handed_over") {
      const handedOverAt = atHour(today, entry.handedOverHour ?? HANDED_OVER_HOUR);
      // `manual` et non `scan` : le semis n'a pas de jeton en main, et une
      // attestation forte qu'aucun code n'a portée serait fausse plutôt que
      // faible. Le type existe précisément pour ne pas les confondre.
      await asStaff(handedOverAt, () =>
        context.commands.execute(new ConfirmManualHandoverCommand(order.reference, SEED_STAFF_SUB)),
      );
    }
  }
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
async function spreadLines(
  context: SeedContext,
  skip: number,
): Promise<{ readonly sku: string; readonly quantity: number }[]> {
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

async function wideLines(
  context: SeedContext,
): Promise<{ readonly sku: string; readonly quantity: number }[]> {
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
