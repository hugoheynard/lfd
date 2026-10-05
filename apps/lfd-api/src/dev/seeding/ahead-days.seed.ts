import {
  LABO,
  PICKUP_WINDOW,
  VILLAGE,
  VILLAGE_MORNING,
  type CounterOrder,
} from "./counter-day.seed.js";
import {
  isoDay,
  place,
  type SeedContext,
  type SeedLine,
  shiftDays,
  type Target,
} from "./order-placing.seed.js";

/**
 * **Les jours qui viennent** — demain et J+2, posés à la remise à l'état de
 * base et jamais avancés ensuite. Sortis de `orders.seed.ts` le 2026-10-05 avec
 * la journée du jour (`documentation/order/plan-jeu-de-donnees-par-etapes.md`).
 */

/** J+2 : la journée du pic — cf. {@link placePeak}. */
export const PEAK_AHEAD = 2;

/**
 * Demain : **trois clients**, un retrait par comptoir et une livraison — cf.
 * `seedOrders`. `client` est un rang : 0 = le client de référence, puis les
 * voisins de `NEIGHBOURS` dans leur ordre.
 *
 * Des paniers qui ne se recoupent PAS (Hugo, 2026-09-28) : chercher une
 * commande doit surligner SES produits en préparation, et deux paniers qui
 * portent le même croissant surligneraient le même rayon pour les deux.
 */
export const TOMORROW: readonly (Pick<CounterOrder, "point" | "window"> & {
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

/**
 * 🔴 **DEMAIN — le plan que l'on arrête ce soir** (Hugo, 2026-09-28).
 *
 * Le plan du soir arrête la prochaine journée À VENIR qui a des commandes.
 * Demain vide, il sautait au pic de J+2 : en démonstration, « arrêter le plan
 * du soir » arrêtait le surlendemain, et la suite du geste — fiche d'atelier,
 * fournée, colisage de demain — ne se montrait pas. Trois commandes, une par
 * acheminement et les deux comptoirs, laissées OUVERTES : c'est à l'équipe de
 * les arrêter, à l'écran.
 */
export async function placeTomorrow(
  context: SeedContext,
  clients: readonly Target[],
  today: Date,
): Promise<void> {
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
}

/**
 * 🔴 **J+2 — et c'est le PIC** (Hugo, 2026-09-17).
 *
 * Deux en attente, une par mode d'acheminement, et **tout le catalogue**
 * réparti entre les deux. C'est la journée que la fiche d'atelier ouvre dès
 * qu'on arrête son plan : elle doit montrer ce que fait un rayon plein, pas
 * six références qui tiennent sans défiler.
 *
 * Deux moitiés COMPLÉMENTAIRES, et pas deux fois la même : le compte à
 * produire somme les commandes, et deux sacs identiques ne prouveraient pas
 * qu'il somme — ils doubleraient simplement chaque ligne.
 *
 * ## Pourquoi J+2 et non plus demain
 *
 * Le prévisionnel s'appelle « le mur qui arrive » : il sert à voir monter une
 * charge, pas à constater celle du jour. Tant que ces deux commandes tombaient
 * à J+1, le jour le plus chargé était AUJOURD'HUI — le comptoir et son sac
 * long — et l'écran ne montrait aucune montée. À J+2, la colonne teintée est
 * devant, et la fenêtre de sept jours la nomme (`J+2`).
 *
 * Les deux moitiés sont lues au catalogue par l'appelant (`spreadLines`), seul
 * fichier du semis admis à le lire (porte `withdrawn-filter`).
 *
 * ⚠️ Elles ont été DÉPLACÉES de J+1, pas ajoutées. Demain a retrouvé des
 * commandes le 2026-09-28 (ci-dessus), mais pas le catalogue entier : le
 * rayon plein reste celui de J+2, et le pic avec lui.
 */
export async function placePeak(
  context: SeedContext,
  target: Target,
  day: {
    readonly today: Date;
    readonly halves: readonly [readonly SeedLine[], readonly SeedLine[]];
  },
): Promise<void> {
  const { today, halves } = day;
  const forDay = isoDay(shiftDays(today, PEAK_AHEAD));
  await place(context, target, {
    at: today,
    forDay,
    method: "delivery",
    point: null,
    window: null,
    lines: halves[0],
    paid: false,
  });
  await place(context, target, {
    at: today,
    forDay,
    method: "pickup",
    point: null,
    window: PICKUP_WINDOW,
    lines: halves[1],
    paid: false,
  });
}
