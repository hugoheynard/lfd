import type { NodeHealth } from '@lfd/ops-contract';

/**
 * **Où poser les nœuds** — calculé du graphe, jamais écrit à la main.
 *
 * Des coordonnées codées en dur seraient plus jolies au premier jour et fausses
 * au second : un nœud ajouté à la topologie atterrirait sur un autre, ou
 * n'apparaîtrait pas du tout. Le rangement suit donc la seule chose qui décrive
 * vraiment la carte — les arêtes.
 *
 * L'axe horizontal est la **profondeur de dépendance** : à gauche ce qui appelle,
 * à droite ce dont on dépend. C'est le sens de lecture de la causalité, celui
 * qu'on suit quand on cherche « qui a fait tomber quoi ».
 */

export interface PlacedNode {
  readonly health: NodeHealth;
  /** Colonne — 0 = personne ne dépend de lui, il est en tête de chaîne. */
  readonly column: number;
  /** Rang dans sa colonne. */
  readonly row: number;
}

export interface PlacedEdge {
  readonly from: string;
  readonly to: string;
}

export interface MapLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly columns: number;
  readonly rows: number;
}

/**
 * Profondeur d'un nœud : la plus longue chaîne de dépendances qui part de lui.
 *
 * `seen` coupe les **cycles**. Une topologie ne devrait pas en avoir, mais elle
 * est écrite à la main : sans cette garde, un aller-retour accidentel entre deux
 * nœuds ferait boucler le rendu de la page à l'infini — une carte de santé qui
 * fige l'onglet, ce qui serait une jolie ironie.
 */
function depthOf(
  id: string,
  dependencies: ReadonlyMap<string, readonly string[]>,
  seen: ReadonlySet<string>,
): number {
  if (seen.has(id)) {
    return 0;
  }
  const next = new Set([...seen, id]);
  const children = dependencies.get(id) ?? [];
  return children.reduce(
    (deepest, child) => Math.max(deepest, 1 + depthOf(child, dependencies, next)),
    0,
  );
}

/**
 * Range les nœuds en colonnes de profondeur décroissante.
 *
 * Les arêtes rendues sont celles dont **les deux extrémités** sont sur la carte :
 * un trait vers un nœud absent ne dessinerait rien et laisserait une ligne
 * pendante à travers l'écran.
 */
export function layoutOf(nodes: readonly NodeHealth[]): MapLayout {
  const present = new Set(nodes.map((node) => node.node));
  const dependencies = new Map(nodes.map((node) => [node.node, node.dependsOn]));
  const deepest = Math.max(
    0,
    ...nodes.map((node) => depthOf(node.node, dependencies, new Set<string>())),
  );

  const byColumn = new Map<number, NodeHealth[]>();
  for (const node of nodes) {
    // On INVERSE : le plus profond (celui qui dépend du plus de monde) à gauche.
    const column = deepest - depthOf(node.node, dependencies, new Set<string>());
    byColumn.set(column, [...(byColumn.get(column) ?? []), node]);
  }

  const placed = [...byColumn.entries()].flatMap(([column, group]) =>
    group.map((health, row) => ({ health, column, row })),
  );

  return {
    nodes: placed,
    edges: nodes.flatMap((node) =>
      node.dependsOn.filter((id) => present.has(id)).map((id) => ({ from: node.node, to: id })),
    ),
    columns: deepest + 1,
    rows: Math.max(1, ...[...byColumn.values()].map((group) => group.length)),
  };
}
