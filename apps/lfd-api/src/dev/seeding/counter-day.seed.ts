import type { OpenPackingContainer } from "@lfd/contracts";

import { ConfirmManualHandoverCommand } from "../../handover/application/commands/confirm-manual-handover.command.js";
import { counterDeliveryContainers } from "./delivery-bins.seed.js";
import { linesFor } from "./order-lines.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  ONE_BAG,
  packFully,
  place,
  type PlacedOrder,
  SEED_STAFF_SUB,
  type SeedContext,
  type SeedLine,
  type Target,
} from "./order-placing.seed.js";
import { placedByKeys, scenarioOrderKey } from "./scenario-keys.seed.js";

/**
 * **La file du comptoir d'aujourd'hui** — sortie de `orders.seed.ts` le
 * 2026-10-05, quand la journée du jour a été découpée en étapes
 * (`documentation/order/plan-jeu-de-donnees-par-etapes.md`) : la poser est
 * l'étape 0, la coliser et la remettre viennent après, dans une autre requête.
 */

/**
 * La tranche demandée sur une commande de RETRAIT au Labo.
 *
 * Elle tient dans le créneau **professionnel** (05:00–06:30), pas dans son
 * ouverture publique : c'est le cas qu'un jeu de données doit montrer, parce que
 * c'est celui qu'un client pro emprunte. Une fenêtre à cheval sur les deux
 * serait refusée — il y a porte close entre les deux.
 */
export const PICKUP_WINDOW = { start: "05:30", end: "06:30" } as const;

/**
 * Les deux tranches du **Village**, qui n'ouvre qu'au public (08:00–18:00).
 *
 * Deux, et à des heures éloignées, pour une raison précise : l'écran de remise
 * ne parle de retard que sur une tranche `override`, et il le calcule contre
 * l'heure courante. Une seule tranche montrerait soit toujours un retard, soit
 * jamais — jamais les deux tons de ligne dans la même matinée.
 */
export const VILLAGE_MORNING = { start: "09:00", end: "10:00" } as const;
export const VILLAGE_AFTERNOON = { start: "14:00", end: "15:00" } as const;

/** Les deux points, par leur libellé — la clé sous laquelle la station les sème. */
export const LABO = "Le Labo";
export const VILLAGE = "Le Village";

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
export interface CounterOrder {
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

export const COUNTER: readonly CounterOrder[] = [
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

/** L'heure du colisage, et celle de la remise. Le sac sort avant de partir. */
export const PACKED_HOUR = 5;
const HANDED_OVER_HOUR = 6;

/** Une ligne de la file, posée : la commande, et ce que la file doit en faire. */
export interface PlacedCounterOrder {
  readonly order: PlacedOrder;
  readonly entry: CounterOrder;
}

/**
 * La file du comptoir, posée la veille. Chaque ligne porte la clé dérivée de
 * son rang (`scenarioOrderKey`) : c'est ainsi que l'étape du colisage la
 * retrouvera.
 *
 * @param wide les lignes du sac long — lues au catalogue par l'appelant, seul
 *   fichier du semis admis à le lire (porte `withdrawn-filter`).
 */
export async function placeCounter(
  context: SeedContext,
  clients: readonly Target[],
  day: { readonly orderedAt: Date; readonly forDay: string; readonly wide: readonly SeedLine[] },
): Promise<readonly PlacedCounterOrder[]> {
  const placed: PlacedCounterOrder[] = [];
  for (const [rank, entry] of COUNTER.entries()) {
    const client = clients[entry.client];
    if (client === undefined) {
      throw new Error(`Client de rang ${String(entry.client)} absent du comptoir du jour.`);
    }
    const order = await place(context, client, {
      at: day.orderedAt,
      forDay: day.forDay,
      method: entry.point === null ? "delivery" : "pickup",
      point: entry.point,
      window: entry.window,
      lines: entry.wide === true ? day.wide : linesFor(entry.step),
      paid: false,
      idempotencyKey: scenarioOrderKey(day.forDay, "counter", rank),
    });
    placed.push({ order, entry });
  }
  return placed;
}

/**
 * La file du comptoir telle que l'étape 0 l'a posée, relue par ses clés.
 * Refuse si une ligne manque : l'étape suivante ne saurait pas quoi en faire.
 */
export async function readCounter(
  context: SeedContext,
  forDay: string,
): Promise<readonly PlacedCounterOrder[]> {
  const keys = COUNTER.map((_, rank) => scenarioOrderKey(forDay, "counter", rank));
  const placed = await placedByKeys(context.prisma, keys);
  return COUNTER.map((entry, rank) => {
    const order = placed.get(keys[rank] ?? "");
    if (order === undefined) {
      throw new Error(
        `La file du comptoir du ${forDay} est incomplète (ligne ${String(rank)} absente) : ` +
          "remettre le scénario à l'état de base.",
      );
    }
    return { order, entry };
  });
}

/** Les lignes de la file qui doivent finir prêtes — les autres restent hors colisage. */
export function counterToPack(
  counter: readonly PlacedCounterOrder[],
): readonly PlacedCounterOrder[] {
  return counter.filter(({ entry }) => entry.outcome !== "expected");
}

/** La file du comptoir, colisée par les gestes du fournil puis remise au comptoir. */
export async function packCounter(
  context: SeedContext,
  counter: readonly PlacedCounterOrder[],
  day: {
    readonly today: Date;
    readonly baked: Set<string>;
    readonly binTypes: ReadonlyMap<string, string>;
  },
): Promise<void> {
  const { today, baked } = day;
  const forDay = isoDay(today);
  const packedAt = atHour(today, PACKED_HOUR);
  for (const { order, entry } of counterToPack(counter)) {
    // Le colisage d'abord, **y compris pour la remise** : un sac sort du fournil
    // avant de changer de mains, et `packingBlocker` refuse de déclarer prête
    // une commande déjà remise. L'ordre inverse marcherait une fois sur deux.
    // 🔴 **Par les gestes du fournil, pas par le statut** (2026-09-28). Cocher
    // en fournée, poser dans le bac et fermer le sac rend la commande prête par
    // l'événement du colisage — le chemin réel, donc un seul état partout.
    // Un sac au comptoir ; la livraison du comptoir, ses bacs (K3c).
    const containers: readonly OpenPackingContainer[] =
      entry.point === null ? counterDeliveryContainers(day.binTypes) : ONE_BAG;
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
