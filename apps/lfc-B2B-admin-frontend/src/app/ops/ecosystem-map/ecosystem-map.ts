import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { HealthStatus, NodeHealth, NodeKind, TrafficWindow } from '@lfd/ops-contract';

import { layoutOf, type PlacedNode } from '../layout';
import { occupancyOf, type Occupancy } from '../occupancy';

/** Géométrie de la carte, en unités du `viewBox`. */
const NODE = { width: 208, height: 48 } as const;
const GAP = { column: 116, row: 16 } as const;
const PADDING = 26;

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
    const { columns, rows } = this.layout();
    const width = columns * NODE.width + (columns - 1) * GAP.column + PADDING * 2;
    const height = rows * NODE.height + (rows - 1) * GAP.row + PADDING * 2;
    return `0 0 ${width} ${height}`;
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
        x: position(placed).x,
        y: position(placed).y,
        statusLabel: STATUS_LABEL[placed.health.status],
        occupancy,
        title: describe(placed.health, occupancy),
        glyph: GLYPHS[placed.health.kind],
        gauge: occupancy.basis === 'aucune mesure' ? null : occupancy.ratio,
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

  /** Exposée au gabarit : les cotes ne doivent exister qu'à UN endroit. */
  protected readonly node = NODE;

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

/** Coin haut-gauche d'un nœud, en unités du `viewBox`. */
function position(placed: PlacedNode): { x: number; y: number } {
  return {
    x: PADDING + placed.column * (NODE.width + GAP.column),
    y: PADDING + placed.row * (NODE.height + GAP.row),
  };
}

/** Une courbe de Bézier du bord droit de l'appelant au bord gauche de l'appelé. */
function curveBetween(from: Box, to: Box): string {
  const startX = from.x + NODE.width;
  const startY = from.y + NODE.height / 2;
  const endY = to.y + NODE.height / 2;
  const bend = GAP.column / 2;
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${to.x - bend} ${endY}, ${to.x} ${endY}`;
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
  const parts = [`${node.label} — ${STATUS_LABEL[node.status]} (${node.reason})`];
  if (occupancy.basis !== 'aucune mesure') {
    parts.push(`occupation ${Math.round(occupancy.ratio * 100)} % d'après la ${occupancy.basis}`);
  }
  if (node.dependencyDown !== undefined) {
    parts.push(`dépendance injoignable : ${node.dependencyDown}`);
  }
  return parts.join(' · ');
}
