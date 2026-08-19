import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type {
  HealthStatus,
  NodeHealth,
  NodeKind,
  TrafficSeries,
  TrafficWindow,
} from '@lfd/ops-contract';

import { layoutOf, type Lane, type LaneWidths, type MapLayout, type PlacedNode } from '../layout';
import { occupancyOf, type Occupancy } from '../occupancy';
import { sparklineOf, type Sparkline } from '../sparkline';
import { REASON_LABEL } from '../reason-label';

/** Géométrie de la carte, en unités du `viewBox`. */
const NODE = { width: 208, height: 48 } as const;
const GAP = { column: 28, row: 64 } as const;
/**
 * L'écart qui sépare un couloir de l'échine. Plus large que l'écart entre deux
 * voisins du même couloir, et c'est tout le propos : c'est ce blanc-là qui dit
 * « ceci n'est pas la suite de cela ».
 */
const LANE_GAP = 72;
/**
 * La vignette de tendance, posée à droite de la bande de relevés. Assez large
 * pour qu'une bosse se voie sur quarante-huit tranches, assez basse pour ne rien
 * coûter en hauteur : elle tient dans la place déjà réservée aux relevés.
 */
const SPARK = { width: 64, height: 12 } as const;
/** L'écart entre deux nœuds empilés dans un couloir latéral — serré, exprès. */
const STACK_GAP = 20;
const PADDING = 26;
/** La bande de relevés, sous chaque carte. Réservée même vide : sans hauteur
 *  constante, une rangée sauterait dès qu'une brique se met à parler. */
const READINGS_BAND = 16;

/**
 * **Les glyphes** — un symbole par nature de brique, tracé au trait.
 *
 * Le trait plutôt que l'aplat, et une géométrie franche : c'est le vocabulaire
 * du schéma technique, celui du sujet. Une carte d'infrastructure qui emprunte
 * ses formes au dessin d'exécution se lit sans qu'on ait à l'apprendre — et
 * elle vieillit mieux qu'une mode graphique.
 *
 * Chaque glyphe tient dans une boîte de 20×20 posée à l'origine ; le composant
 * la translate. Les tracer ici, en données, plutôt que dans le gabarit : le
 * gabarit ne doit pas devenir une planche à dessin.
 */
const GLYPHS: Readonly<Record<NodeKind, readonly string[]>> = {
  // La porte : deux montants, et ce qui les traverse.
  worker: ['M4 3v14', 'M16 3v14', 'M7 10h6', 'M11 7l3 3-3 3'],
  // Le service : des lames empilées, chacune avec sa diode.
  service: ['M3 5h14v4H3z', 'M3 11h14v4H3z', 'M5.5 7h.01', 'M5.5 13h.01'],
  // Le cylindre du stockage.
  datastore: [
    'M4 5c0-1.1 2.7-2 6-2s6 .9 6 2-2.7 2-6 2-6-.9-6-2z',
    'M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5',
  ],
  // Le globe : ce qui n'est pas à nous.
  'external-api': [
    'M10 3a7 7 0 100 14 7 7 0 000-14z',
    'M3 10h14',
    'M10 3c1.8 1.9 2.8 4.4 2.8 7s-1 5.1-2.8 7',
    'M10 3C8.2 4.9 7.2 7.4 7.2 10s1 5.1 2.8 7',
  ],
  // La fenêtre : ce qu'on ouvre pour entrer dans le système.
  frontend: ['M3 4h14v12H3z', 'M3 8h14', 'M5.5 6h.01'],
};

/** Bornes de la durée d'un cycle de pointillés — la VITESSE dit le débit. */
const FLOW = { fastest: 0.7, slowest: 4 } as const;

/** Le libellé d'un statut. La couleur ne parle jamais seule (contraste, daltonisme). */
const STATUS_LABEL: Readonly<Record<HealthStatus, string>> = {
  up: 'OK',
  degraded: 'Dégradé',
  down: 'Injoignable',
  unknown: 'Inconnu',
};

/** Un trait de la carte, prêt à rendre. */
interface Link {
  readonly id: string;
  /** Identifiant DOM du tracé — les paquets s'y accrochent par `mpath`. */
  readonly wire: string;
  readonly path: string;
  readonly tone: string;
  /** Durée d'un cycle en secondes — `null` ⇒ rien ne coule, on n'anime pas. */
  readonly duration: number | null;
  /** Décalages de départ des paquets, pour qu'ils ne partent pas en peloton. */
  readonly offsets: readonly number[];
  readonly title: string;
}

/** Combien de paquets circulent sur un fil. Trois : assez pour lire un flux. */
const PACKETS = 3;

/** Un nœud posé, prêt à rendre. */
interface Box {
  readonly node: NodeHealth;
  readonly x: number;
  readonly y: number;
  readonly statusLabel: string;
  readonly occupancy: Occupancy;
  readonly title: string;
  readonly glyph: readonly string[];
  /** Part du plafond, en pourcentage plein — `null` quand rien n'est mesuré. */
  readonly gauge: number | null;
  /** Ce que CE nœud dit de son activité, déjà mis en forme. Vide = rien à dire. */
  readonly readings: string;
  /** Sa courbe des 24 h, ou `null` — rien ne garde l'histoire d'un tiers. */
  readonly spark: Sparkline | null;
}

/**
 * **Le schéma de l'écosystème** — les nœuds déclarés, les liens de dépendance,
 * et l'état de chacun.
 *
 * Purement présentationnel : il ne charge rien, ne juge rien, et ne connaît pas
 * l'API. Le statut est **dérivé côté serveur** (pur et testé) ; le refaire ici
 * donnerait deux vérités sur ce que « ça va » veut dire.
 *
 * Deux encodages, délibérément séparés (design §13) :
 *
 * - **la couleur d'un lien** vient de l'**occupation** du nœud vers lequel il
 *   pointe — la proximité du plafond, jamais le volume. Un trait qui rougit
 *   parce que le trafic monte alors que tout va bien apprendrait à ignorer la
 *   couleur ;
 * - **la vitesse des pointillés** dit le débit. C'est le seul endroit où le
 *   volume s'exprime, et il ne peut alarmer personne.
 *
 * Le statut d'un nœud est écrit EN TOUTES LETTRES à côté de sa pastille : une
 * carte qui ne parle qu'en couleurs est illisible pour une partie des gens qui
 * la regardent, et invérifiable en capture d'écran.
 */
@Component({
  selector: 'app-ecosystem-map',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './ecosystem-map.html',
  styleUrl: './ecosystem-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EcosystemMap {
  readonly nodes = input.required<readonly NodeHealth[]>();
  readonly windows = input<readonly TrafficWindow[]>([]);
  readonly series = input<readonly TrafficSeries[]>([]);

  private readonly sparklines = computed(() => {
    const byNode = new Map(this.series().map((one) => [one.node, one.points]));
    return new Map(
      this.nodes().map(
        (node) =>
          [node.node, sparklineOf(byNode.get(node.node) ?? [], SPARK.width, SPARK.height)] as const,
      ),
    );
  });

  private readonly layout = computed(() => layoutOf(this.nodes()));

  private readonly occupancies = computed(() => {
    const byNode = new Map(this.windows().map((window) => [window.node, window]));
    return new Map(
      this.nodes().map((node) => [node.node, occupancyOf(byNode.get(node.node))] as const),
    );
  });

  private readonly requestsByNode = computed(
    () => new Map(this.windows().map((window) => [window.node, window.requests])),
  );

  protected readonly viewBox = computed(() => {
    const { columns, lanes } = this.layout();
    // L'axe est VERTICAL : la profondeur de dépendance descend, et les fronts —
    // les plus profonds, puisque tout part d'eux — se posent en bas. C'est le
    // sens dans lequel on raconte une panne : « je clique, et… ».
    // La toile doit contenir l'échine ET la plus haute des deux ailes : une aile
    // plus longue que l'échine déborderait par le bas, silencieusement.
    const spine = columns * (NODE.height + READINGS_BAND) + (columns - 1) * GAP.row + PADDING * 2;
    const height = Math.max(spine, stackHeight(lanes.left), stackHeight(lanes.right));
    return `0 0 ${canvasWidth(lanes)} ${height}`;
  });

  protected readonly boxes = computed<readonly Box[]>(() =>
    this.layout().nodes.map((placed) => {
      const occupancy = this.occupancies().get(placed.health.node) ?? {
        ratio: 0,
        tone: 'calm' as const,
        basis: 'aucune mesure' as const,
      };
      return {
        node: placed.health,
        x: position(placed, this.layout()).x,
        y: position(placed, this.layout()).y,
        statusLabel: STATUS_LABEL[placed.health.status],
        occupancy,
        title: describe(placed.health, occupancy),
        glyph: GLYPHS[placed.health.kind],
        gauge: occupancy.basis === 'aucune mesure' ? null : occupancy.ratio,
        readings: formatReadings(placed.health.readings),
        spark: this.sparklines().get(placed.health.node) ?? null,
      };
    }),
  );

  protected readonly links = computed<readonly Link[]>(() => {
    const at = new Map(this.boxes().map((box) => [box.node.node, box]));
    return this.layout().edges.flatMap((edge, index) => {
      const from = at.get(edge.from);
      const to = at.get(edge.to);
      if (from === undefined || to === undefined) {
        return [];
      }
      const occupancy = to.occupancy;
      const requests = this.requestsByNode().get(edge.to) ?? 0;
      const duration = requests > 0 ? flowDuration(requests) : null;
      return [
        {
          id: `${edge.from}→${edge.to}`,
          wire: `ops-wire-${index}`,
          path: curveBetween(from, to),
          tone: occupancy.basis === 'aucune mesure' ? 'unmeasured' : occupancy.tone,
          duration,
          offsets:
            duration === null
              ? []
              : Array.from({ length: PACKETS }, (_, slot) => (duration / PACKETS) * slot),
          title: `${from.node.label} dépend de ${to.node.label}`,
        },
      ];
    });
  });

  /** Exposées au gabarit : les cotes ne doivent exister qu'à UN endroit. */
  protected readonly node = NODE;
  protected readonly spark = SPARK;

  /**
   * Le mouvement est-il le bienvenu ?
   *
   * Les paquets qui circulent sont de l'**animation déclarative SVG**
   * (`animateMotion`), et celle-là ne s'éteint pas depuis une feuille de style :
   * il faut ne pas la RENDRE. D'où cette lecture, faite une fois — le reste de
   * la carte (couleur, jauge, libellé) dit déjà tout, donc on ne perd rien.
   */
  protected readonly motionAllowed = signal(
    typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  protected readonly hasNothingMeasured = computed(() =>
    this.boxes().every((box) => box.occupancy.basis === 'aucune mesure'),
  );
}

/** Le pas d'un nœud au suivant, dans un même couloir. */
const STEP = NODE.width + GAP.column;

/** La largeur d'un groupe de `count` nœuds côte à côte. */
function spanOf(count: number): number {
  return count === 0 ? 0 : count * NODE.width + (count - 1) * GAP.column;
}

/** Ce qu'un couloir latéral prend en largeur : un nœud, ou rien s'il est vide. */
function wingSpan(count: number): number {
  return count === 0 ? 0 : NODE.width + LANE_GAP;
}

/** Le centre de chaque couloir, en abscisse. Un seul calcul, trois usages. */
function axesOf(lanes: LaneWidths): Record<Lane, number> {
  const centre = spanOf(lanes.centre);
  const centreAxis = PADDING + wingSpan(lanes.left) + centre / 2;
  return {
    [-1]: centreAxis - centre / 2 - LANE_GAP - NODE.width / 2,
    [0]: centreAxis,
    [1]: centreAxis + centre / 2 + LANE_GAP + NODE.width / 2,
  };
}

/** La toile : l'échine, ses deux ailes, et les marges. */
function canvasWidth(lanes: LaneWidths): number {
  return PADDING * 2 + wingSpan(lanes.left) + spanOf(lanes.centre) + wingSpan(lanes.right);
}

/** La hauteur d'une pile de `count` nœuds, marges comprises. */
function stackHeight(count: number): number {
  return count === 0
    ? 0
    : PADDING * 2 + count * (NODE.height + READINGS_BAND) + (count - 1) * STACK_GAP;
}

/**
 * Coin haut-gauche d'un nœud. La **bande** de profondeur devient une rangée, et
 * elle est inversée : la bande 0 (ce dont tout part — les fronts) atterrit en
 * bas, ce dont on dépend remonte. Le **couloir** devient l'abscisse.
 */
function position(placed: PlacedNode, layout: MapLayout): { x: number; y: number } {
  const band = (layout.columns - 1 - placed.column) * (NODE.height + READINGS_BAND + GAP.row);
  const stacked = placed.stack * (NODE.height + READINGS_BAND + STACK_GAP);
  return {
    x: axesOf(layout.lanes)[placed.lane] + placed.offset * STEP - NODE.width / 2,
    y: PADDING + band + stacked,
  };
}

/**
 * La courbe qui relie un appelant à ce dont il dépend.
 *
 * Elle sort par le bord le plus **direct**, pas toujours par le haut : depuis
 * que les tiers sont empilés sur le côté, une aile peut se trouver plus bas que
 * l'API qui l'appelle. Un tracé qui partirait quand même vers le haut ferait une
 * boucle, et une boucle se lit comme un aller-retour — c'est-à-dire comme
 * quelque chose que le graphe ne dit pas.
 *
 * L'arbitrage est purement géométrique : le plus grand des deux écarts gagne.
 */
function curveBetween(from: Box, to: Box): string {
  const start = { x: from.x + NODE.width / 2, y: from.y + NODE.height / 2 };
  const end = { x: to.x + NODE.width / 2, y: to.y + NODE.height / 2 };
  if (Math.abs(end.x - start.x) > Math.abs(end.y - start.y)) {
    return sideways(from, to, start.y, end.y);
  }
  const startY = end.y < start.y ? from.y : from.y + NODE.height;
  const endY = end.y < start.y ? to.y + NODE.height : to.y;
  const bend = GAP.row / 2;
  return `M ${start.x} ${startY} C ${start.x} ${startY - bend}, ${end.x} ${endY + bend}, ${end.x} ${endY}`;
}

/** Le tracé de flanc à flanc, quand l'écart horizontal domine. */
function sideways(from: Box, to: Box, startY: number, endY: number): string {
  const goesRight = to.x > from.x;
  const startX = goesRight ? from.x + NODE.width : from.x;
  const endX = goesRight ? to.x : to.x + NODE.width;
  const bend = (endX - startX) / 2;
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

/**
 * Plus il passe de requêtes, plus les pointillés vont vite. L'échelle est
 * **logarithmique** : de dix à mille requêtes, une échelle linéaire écraserait
 * tout le bas du spectre — et c'est justement là que vit le trafic d'aujourd'hui.
 */
function flowDuration(requests: number): number {
  const decades = Math.min(1, Math.log10(requests + 1) / 4);
  return FLOW.slowest - decades * (FLOW.slowest - FLOW.fastest);
}

/** L'infobulle : ce que la couleur ne peut pas dire. */
function describe(node: NodeHealth, occupancy: Occupancy): string {
  const parts = [`${node.label} — ${STATUS_LABEL[node.status]} (${REASON_LABEL[node.reason]})`];
  if (occupancy.basis !== 'aucune mesure') {
    parts.push(`occupation ${Math.round(occupancy.ratio * 100)} % d'après la ${occupancy.basis}`);
  }
  if (node.dependencyDown !== undefined) {
    parts.push(`dépendance injoignable : ${node.dependencyDown}`);
  }
  return parts.join(' · ');
}

/**
 * Les relevés en une ligne. Trois au plus : au-delà, une carte de schéma cesse
 * d'être une carte et devient un tableau — or le tableau existe déjà, plus bas.
 */
function formatReadings(readings: NodeHealth['readings']): string {
  return readings
    .slice(0, 3)
    .map((reading) => `${reading.label} ${reading.value}${reading.unit ?? ''}`)
    .join(' · ');
}
