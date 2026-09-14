import type { PackingResource, PackingSheet, ProductionPackingView } from "@lfd/contracts";

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
  if (sources.closedAt === null) {
    return { date: sources.date, closedAt: null, sheets: [], resources: [] };
  }
  const awaiting = awaitingOf(sources.counts);
  return {
    date: sources.date,
    closedAt: sources.closedAt.toISOString(),
    sheets: [...sources.orders]
      .map((order) => sheetOf(order, awaiting))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
    resources: resourcesOf(sources, awaiting),
  };
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

/** Un bac : le bon tel qu'il a été figé, plus l'état de son remplissage. */
function sheetOf(order: ProductionOrderSnapshot, awaiting: (sku: string) => boolean): PackingSheet {
  return {
    reference: order.reference,
    containers: order.containers,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    lines: [...order.lines]
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
      .sort(byNameThenSku),
    packedAt: order.packed?.at.toISOString() ?? null,
    packedBy: order.packed?.by ?? null,
  };
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
      return {
        sku,
        productName: count?.productName ?? names.get(sku) ?? sku,
        produced: count?.quantity ?? 0,
        allocated: taken,
        remaining: (count?.quantity ?? 0) - taken,
        awaitingProduction: awaiting(sku),
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
