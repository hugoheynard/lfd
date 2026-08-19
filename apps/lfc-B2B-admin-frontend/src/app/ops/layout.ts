import type { NodeHealth, NodeKind } from '@lfd/ops-contract';

/**
 * **Où poser les nœuds** — calculé du graphe, jamais écrit à la main.
 *
 * Des coordonnées codées en dur seraient plus jolies au premier jour et fausses
 * au second : un nœud ajouté à la topologie atterrirait sur un autre, ou
 * n'apparaîtrait pas du tout. Le rangement suit donc la seule chose qui décrive
 * vraiment la carte — les arêtes.
 *
 * Deux axes, et chacun répond à une question différente :
 *
 * - **la profondeur** dit *qui appelle qui*. C'est le sens de lecture de la
 *   causalité, celui qu'on suit quand on cherche « qui a fait tomber quoi » ;
 * - **le couloir** dit *de quelle nature* est la dépendance. Sans lui, tout ce
 *   dont l'API dépend tombe sur une seule ligne : une base et une API tierce y
 *   deviennent interchangeables, alors qu'une panne de tierce dégrade une
 *   fonction et qu'une base perdue arrête tout.
 *
 * Le résultat est une **échine** — fronts, passerelle, API — avec ce qu'on
 * garde d'un côté et ce qu'on appelle de l'autre.
 *
 * Les deux couloirs latéraux **s'empilent** au lieu de s'étaler : quatre tiers
 * côte à côte doublaient la largeur de la toile, et une toile deux fois plus
 * large se rend deux fois plus petite — les chiffres devenaient illisibles, ce
 * qui est le contraire de ce qu'on demande à cette carte. Ils sont tous à la
 * même profondeur (ce sont des feuilles) : les empiler est un choix de RENDU,
 * pas une affirmation sur le graphe.
 */

/**
 * **Le couloir d'un nœud, déduit de sa nature.**
 *
 * `-1` à gauche, `0` sur l'échine, `+1` à droite. Une table plutôt qu'une
 * condition : un `kind` ajouté au contrat ne compilera pas tant qu'il n'aura
 * pas choisi son côté, ce qui vaut mieux que d'atterrir au centre par défaut.
 */
const LANE_OF_KIND: Readonly<Record<NodeKind, Lane>> = {
  // Ce qu'on GARDE : bases et stockage. À gauche, ensemble, parce qu'ils se
  // perdent ensemble et qu'on les regarde ensemble.
  datastore: -1,
  // Ce qu'on APPELLE : les tiers. À droite — leur panne dégrade une fonction,
  // elle n'efface rien.
  'external-api': 1,
  // L'échine : le chemin d'une requête, du navigateur à l'API.
  service: 0,
  worker: 0,
  frontend: 0,
};

export type Lane = -1 | 0 | 1;

export interface PlacedNode {
  readonly health: NodeHealth;
  /** Bande de profondeur — 0 = personne ne dépend de lui, il est en tête de chaîne. */
  readonly column: number;
  readonly lane: Lane;
  /**
   * Position dans son groupe, en **pas de nœud**, comptée depuis le centre du
   * groupe. Un groupe de deux donne `-0,5` et `+0,5` : chaque bande est ainsi
   * centrée sur son couloir sans que le rendu ait à recompter les voisins.
   *
   * Toujours `0` dans un couloir latéral, qui empile au lieu d'étaler.
   */
  readonly offset: number;
  /** Rang dans la pile — `0` sauf dans les couloirs latéraux, qui descendent. */
  readonly stack: number;
}

export interface PlacedEdge {
  readonly from: string;
  readonly to: string;
}

/**
 * Le plus grand groupe rencontré dans chaque couloir — de quoi cadrer la toile.
 * Au centre c'est une largeur (on étale) ; sur les côtés une hauteur (on empile).
 */
export interface LaneWidths {
  readonly left: number;
  readonly centre: number;
  readonly right: number;
}

export interface MapLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly columns: number;
  readonly lanes: LaneWidths;
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

/** La clé d'un groupe : une bande de profondeur, dans un couloir. */
function groupKey(column: number, lane: Lane): string {
  return `${column}:${lane}`;
}

/**
 * Range les nœuds par bande de profondeur, puis par couloir.
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

  const groups = new Map<string, NodeHealth[]>();
  for (const node of nodes) {
    // On INVERSE : le plus profond (celui qui dépend du plus de monde) en tête.
    const column = deepest - depthOf(node.node, dependencies, new Set<string>());
    const key = groupKey(column, LANE_OF_KIND[node.kind]);
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  const placed = [...groups.values()].flatMap((group) =>
    group.map((health, index) => {
      const lane = LANE_OF_KIND[health.kind];
      return {
        health,
        column: deepest - depthOf(health.node, dependencies, new Set<string>()),
        lane,
        offset: lane === 0 ? index - (group.length - 1) / 2 : 0,
        stack: lane === 0 ? 0 : index,
      };
    }),
  );

  return {
    nodes: placed,
    edges: nodes.flatMap((node) =>
      node.dependsOn.filter((id) => present.has(id)).map((id) => ({ from: node.node, to: id })),
    ),
    columns: deepest + 1,
    lanes: widestPerLane(placed),
  };
}

/** Le plus grand groupe de chaque couloir, toutes bandes confondues. */
function widestPerLane(placed: readonly PlacedNode[]): LaneWidths {
  const sizes = new Map<string, number>();
  for (const node of placed) {
    const key = groupKey(node.column, node.lane);
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const widest = (lane: Lane): number =>
    Math.max(
      0,
      ...[...sizes.entries()].filter(([key]) => key.endsWith(`:${lane}`)).map(([, size]) => size),
    );
  return { left: widest(-1), centre: widest(0), right: widest(1) };
}
