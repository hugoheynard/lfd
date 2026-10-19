/**
 * **Les deux schémas du guide, en données** : les composants SVG
 * (`vitrine-sequence-diagram`, `vitrine-schema-diagram`) en lisent les
 * libellés, le générateur Markdown en tire deux blocs `mermaid`. Les
 * coordonnées, elles, restent dans les gabarits SVG : Mermaid place seul.
 */

export const SEQUENCE_ACTORS = {
  server: 'La Folie Coffee (serveur)',
  site: 'Votre site',
} as const;

/** Le balayage, posé en note sur la ligne de vie du serveur. */
export const SEQUENCE_SWEEP = '① toutes les 5 min au plus : qu’est-ce qui a changé ?';

export interface SequenceMessage {
  readonly from: keyof typeof SEQUENCE_ACTORS;
  /** `true` : une réponse (trait pointillé). */
  readonly reply: boolean;
  readonly label: string;
  readonly sub?: string;
}

/** ② à ⑤, dans l'ordre du dessin. */
export const SEQUENCE_MESSAGES = {
  notify: {
    from: 'server',
    reply: false,
    label: '② POST signé — Vitrine-Signature, Vitrine-Delivery',
    sub: 'corps : les clés changées et retirées, pas le contenu',
  },
  ack: { from: 'site', reply: true, label: '③ 2xx en moins de 5 s' },
  read: { from: 'site', reply: false, label: '④ GET /vitrine/… ?lang= — X-Vitrine-Key' },
  served: { from: 'server', reply: true, label: '⑤ JSON — la vue publique, filtrée par vos cases' },
} as const satisfies Record<string, SequenceMessage>;

export const SEQUENCE_FAILURE = {
  title: 'Si ③ n’arrive pas (autre statut, redirection, délai dépassé) :',
  lines: [
    'nouvel essai de la MÊME livraison (même Vitrine-Delivery), au plus tôt après 30 s, 1 min, 2 min… en doublant ;',
    'au 10ᵉ échec, l’abonnement passe « en échec » et plus rien ne part, jusqu’à ce que La Folie',
    'clique « Tout renvoyer » : la notification suivante nomme alors TOUT comme changé.',
  ],
} as const;

/** Une boîte du schéma des relations. */
export interface SchemaBox {
  readonly title: string;
  readonly lines: readonly string[];
}

export const SCHEMA_BOXES = {
  catalogue: { title: 'Catalogue', lines: ['language · shelves[] · items[] · operations[]'] },
  shelf: { title: 'Rayon', lines: ['id', 'name · position'] },
  item: {
    title: 'Article',
    lines: [
      'sku',
      'name · note · audience',
      'prix HT · TTC · à barrer',
      'shelfId · operation?',
      'isFeatured? · images',
    ],
  },
  operation: {
    title: 'Opération',
    lines: ['key · state', 'name · lede', '(fr, en, it)', 'dates · image', 'skus[]'],
  },
  image: { title: 'Image ×2', lines: ['url · alt · width · height'] },
  focal: { title: 'Point focal', lines: ['x · y (0 à 1)'] },
  texts: { title: 'Textes', lines: ['GET /vitrine/textes', 'clé → texte affiché'] },
  notification: {
    title: 'Notification (ce que nous vous POSTons)',
    lines: [
      'changed / removed : items · operations · shelves · texts',
      '= des sku, des key, des id, des clés de textes',
    ],
  },
} as const satisfies Record<string, SchemaBox>;

export type SchemaBoxKey = keyof typeof SCHEMA_BOXES;

/** Trait plein : `from` contient `to`. */
export const SCHEMA_CONTAINS: readonly (readonly [SchemaBoxKey, SchemaBoxKey])[] = [
  ['catalogue', 'shelf'],
  ['catalogue', 'item'],
  ['catalogue', 'operation'],
  ['item', 'image'],
  ['image', 'focal'],
];

/** Trait pointillé : `from` renvoie à `to` par le champ `label`. */
export const SCHEMA_REFERENCES = {
  shelf: { from: 'item', to: 'shelf', label: 'shelfId' },
  operation: { from: 'item', to: 'operation', label: 'operation.key' },
  skus: { from: 'operation', to: 'item', label: 'skus[]' },
} as const satisfies Record<
  string,
  { readonly from: SchemaBoxKey; readonly to: SchemaBoxKey; readonly label: string }
>;

export const SCHEMA_LEGEND = 'trait plein : contient — pointillé : renvoie par une clé';
