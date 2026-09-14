import {
  addDays,
  instantToLocal,
  type PackingLine,
  type PackingResource,
  type PackingSheet,
  type ProductionPackingView,
} from "@lfd/contracts";

import type { ProducedItemSnapshot, ProductionOrderSnapshot } from "../entities/production-day.js";

/**
 * **Le poste de colisage** — les bacs d'un côté, ce que le four a sorti de
 * l'autre, pris au même instant.
 *
 * Une fonction pure, comme `worksheetOf` : le handler charge la journée et lui
 * passe son état. C'est ce qui rend la **balance** — le calcul du reste à
 * répartir — éprouvable sans Nest, sans base, et sans doubler quoi que ce soit.
 *
 * ⚠️ Ce n'est pas la fiche d'atelier sous un autre angle. La fiche a pour clé le
 * RAYON (« qu'est-ce qu'on sort du four », tous clients confondus) ; ici la clé
 * est la **commande** (« ce bac est-il complet »). Les deux lisent la même
 * journée et ne posent pas la même question.
 */

/** Ce que le handler pose sur la table — l'état de la journée, et rien d'autre. */
export interface PackingSources {
  readonly date: string;
  /** `null` = la journée n'est pas arrêtée, il n'y a aucun bac à remplir. */
  readonly closedAt: Date | null;
  readonly orders: readonly ProductionOrderSnapshot[];
  /** Le compte à produire : la moitié « ressource » de la balance. */
  readonly counts: readonly ProducedItemSnapshot[];
  /**
   * L'instant du **serveur**, lu par le port `Clock` dans le handler. Il ne sert
   * qu'à dire si la journée lue est aujourd'hui ou demain : l'horloge d'un poste
   * de fournil n'est pas une autorité, et la fonction reste pure.
   */
  readonly now: Date;
}

/**
 * Assemble le poste.
 *
 * ## Une journée ouverte rend le vide, et ne lève pas
 *
 * `closedAt: null`, `sheets: []`, `resources: []`. L'écran dit alors « plan non
 * arrêté » plutôt que de montrer une liste vide qui ressemblerait à « tout est
 * fait ». Lever serait pire encore : une lecture n'a pas à refuser un jour qui
 * existe et qu'on a simplement ouvert trop tôt.
 *
 * ## Les deux ordres, écrits et non subis
 *
 * Les bacs par **référence** : c'est le numéro qu'on lit sur le bon posé devant
 * soi, et c'est le seul tri qui permette de retrouver le même écran après un
 * rafraîchissement. Les ressources par **nom de produit puis SKU** : on cherche
 * « croissant », pas `VIE-001`, et le SKU départage pour que deux lectures ne
 * puissent jamais rendre deux ordres.
 */
export function packingBoardOf(sources: PackingSources): ProductionPackingView {
  const relativeDay = relativeDayOf(sources.date, sources.now);
  if (sources.closedAt === null) {
    return {
      date: sources.date,
      closedAt: null,
      sheets: [],
      resources: [],
      orderCount: 0,
      todoCount: 0,
      readyCount: 0,
      relativeDay,
    };
  }
  const awaiting = awaitingOf(sources.counts);
  const readyCount = sources.orders.filter((order) => order.packed !== null).length;
  return {
    date: sources.date,
    closedAt: sources.closedAt.toISOString(),
    sheets: [...sources.orders]
      .map((order) => sheetOf(order, awaiting))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
    resources: resourcesOf(sources, awaiting),
    orderCount: sources.orders.length,
    todoCount: sources.orders.length - readyCount,
    readyCount,
    relativeDay,
  };
}

/**
 * **La règle de « Déclarer prête »** — écrite ici, et nulle part ailleurs.
 *
 * Toutes les lignes sont dans le bac, et la commande n'est pas déjà déclarée.
 * C'est une RÈGLE, donc au serveur (décidé le 2026-09-14) : un bouton dont
 * l'écran décide seul s'il est actif proposerait, le jour où elle change ici, un
 * geste que le serveur refuse.
 *
 * ⚠️ Une commande **sans ligne** n'est pas déclarable, alors que « toutes ses
 * lignes sont dans le bac » serait vrai sur une liste vide. Rien ne produit une
 * telle commande aujourd'hui ; si l'une apparaissait, la déclarer prête
 * annoncerait au client un colis qui ne contient rien.
 *
 * ⚠️ Ce n'est pas la garde de la route de scan, qui reste inconditionnelle :
 * elle est encodée dans des QR déjà imprimés (cf. le plan). L'écran est plus
 * exigeant que la route, et c'est assumé.
 */
export function canDeclareReady(order: ProductionOrderSnapshot): boolean {
  return (
    order.packed === null &&
    order.lines.length > 0 &&
    order.lines.every((line) => line.packed !== null)
  );
}

/**
 * La journée lue, **relativement à aujourd'hui à Paris**.
 *
 * Le jour se lit à l'heure de la maison (`instantToLocal`, `Europe/Paris`), et
 * surtout pas en UTC : à 00 h 30 à Paris l'été, il est 22 h 30 UTC la VEILLE, et
 * un `toISOString().slice(0, 10)` dirait « demain » d'une journée qui a déjà
 * commencé au fournil. Même lecture que `billing-cycle` et `pain008`
 * (vérifié le 2026-09-14).
 *
 * Aucune conversion jour → instant ici : on compare deux jours `AAAA-MM-JJ`
 * entre eux, ce que le tri lexicographique d'un jour ISO permet sans fuseau.
 */
export function relativeDayOf(serviceDay: string, now: Date): ProductionPackingView["relativeDay"] {
  const today = instantToLocal(now).day;
  if (serviceDay === today) {
    return "today";
  }
  return serviceDay === addDays(today, 1) ? "tomorrow" : null;
}

/**
 * **Ce qui attend encore le four**, article par article.
 *
 * Deux situations, un seul verdict, et la seconde n'est pas évidente à la
 * relecture :
 *
 * - la ligne du compte à produire **n'est pas cochée** — le fournil ne l'a pas
 *   encore sortie ;
 * - le SKU **n'est pas au compte du tout** — il est arrivé après le tirage,
 *   donc personne ne l'a fabriqué ni même pu le cocher.
 *
 * Les deux mènent au même refus parce qu'ils disent la même chose du monde
 * réel : la marchandise n'existe pas encore. Traiter le second comme
 * disponible, sous prétexte qu'aucune ligne ne dit le contraire, ferait de
 * l'absence d'information une autorisation.
 */
function awaitingOf(counts: readonly ProducedItemSnapshot[]): (sku: string) => boolean {
  const produced = new Set(counts.filter((item) => item.done !== null).map((item) => item.sku));
  return (sku) => !produced.has(sku);
}

/**
 * Un bac : le bon tel qu'il a été figé, l'état de son remplissage, et ses
 * compteurs.
 *
 * Les compteurs sont ici et pas à l'écran (décidé le 2026-09-14) : deux calculs
 * du même chiffre divergent à la première règle modifiée d'un seul côté.
 * `pieces` compte en PIÈCES, l'unité de la marchandise à répartir — un compte
 * de lignes ne se compare à rien.
 */
function sheetOf(order: ProductionOrderSnapshot, awaiting: (sku: string) => boolean): PackingSheet {
  const packed = order.lines.filter((line) => line.packed !== null);
  return {
    reference: order.reference,
    containers: order.containers,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    lines: linesOf(order, awaiting),
    lineCount: order.lines.length,
    packedLines: packed.length,
    remainingLines: order.lines.length - packed.length,
    pieces: sumOfQuantities(order.lines),
    packedPieces: sumOfQuantities(packed),
    canDeclareReady: canDeclareReady(order),
    packedAt: order.packed?.at.toISOString() ?? null,
    packedBy: order.packed?.by ?? null,
  };
}

/** Les lignes d'un bac, rangées par nom puis SKU. */
function linesOf(
  order: ProductionOrderSnapshot,
  awaiting: (sku: string) => boolean,
): readonly PackingLine[] {
  return [...order.lines]
    .map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      packed: line.packed !== null,
      // La chaîne vide n'est pas une signature : une ligne au bac sans
      // initiales rend `null`, comme une ligne pas encore rangée. L'écran n'a
      // alors rien à afficher, plutôt qu'un blanc qui appelle un crayon.
      initials: line.packed === null || line.packed.initials === "" ? null : line.packed.initials,
      packedAt: line.packed?.at.toISOString() ?? null,
      awaitingProduction: awaiting(line.sku),
    }))
    .sort(byNameThenSku);
}

function sumOfQuantities(lines: readonly { readonly quantity: number }[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * **La balance**, article par article.
 *
 * `remaining` peut être **négatif**, et ce n'est pas une erreur de calcul : les
 * bacs demandent alors plus que le tirage n'a prévu. C'est précisément le cas
 * qu'un fournil doit voir tôt, et le masquer à zéro l'effacerait — c'est aussi
 * ce que le contrat promet.
 *
 * ⚠️ Les SKU des bacs sont réunis à ceux du compte, et non lus dans le seul
 * compte. Les deux coïncident tant que rien ne dérive — le compte se refait
 * depuis les commandes, à la clôture comme au retirage — mais un article présent
 * dans un bac et absent du compte disparaîtrait de la balance alors que ses
 * pièces sont bel et bien prises quelque part. `produced: 0` le dit, et le
 * `remaining` négatif qui s'ensuit crie ce qu'il faut entendre.
 */
function resourcesOf(
  sources: PackingSources,
  awaiting: (sku: string) => boolean,
): readonly PackingResource[] {
  const allocated = new Map<string, number>();
  const names = new Map<string, string>();
  for (const order of sources.orders) {
    for (const line of order.lines) {
      names.set(line.sku, names.get(line.sku) ?? line.productName);
      if (line.packed !== null) {
        allocated.set(line.sku, (allocated.get(line.sku) ?? 0) + line.quantity);
      }
    }
  }
  const produced = new Map(sources.counts.map((item) => [item.sku, item] as const));
  // Le nom du COMPTE l'emporte sur celui des bons : c'est celui que le fournil
  // lit depuis 4 h sur sa fiche, et deux écrans du même matin n'ont pas à
  // nommer le même article de deux façons.
  const skus = new Set([...produced.keys(), ...names.keys()]);
  return [...skus]
    .map((sku) => {
      const count = produced.get(sku);
      const taken = allocated.get(sku) ?? 0;
      const remaining = (count?.quantity ?? 0) - taken;
      const awaitingProduction = awaiting(sku);
      return {
        sku,
        productName: count?.productName ?? names.get(sku) ?? sku,
        produced: count?.quantity ?? 0,
        allocated: taken,
        remaining,
        awaitingProduction,
        exhausted: remaining === 0 && !awaitingProduction,
      };
    })
    .sort(byNameThenSku);
}

/** Le nom d'abord — c'est ce qu'on cherche des yeux ; le SKU départage. */
function byNameThenSku(
  left: { readonly productName: string; readonly sku: string },
  right: { readonly productName: string; readonly sku: string },
): number {
  return left.productName.localeCompare(right.productName) || left.sku.localeCompare(right.sku);
}
