/**
 * **Le schéma de données servi à l'agence du site vitrine**, en tableaux.
 *
 * Recopié des types de `packages/contracts/src/vitrine.ts` et
 * `packages/contracts/src/shop-catalogue.ts` (relus le 2026-10-18). Ce n'est
 * pas une source : un champ ajouté au contrat n'apparaît ici que si quelqu'un
 * l'y écrit. Les valeurs de `type` sont celles du fil JSON, pas de TypeScript.
 */

/** Ce qu'un champ promet : toujours là, parfois `null`, parfois absent du fil. */
export type VitrineFieldPresence = 'toujours' | 'peut valoir null' | 'peut être absent';

export interface VitrineField {
  readonly field: string;
  readonly type: string;
  readonly presence: VitrineFieldPresence;
  readonly description: string;
}

export interface VitrineEntity {
  /** Ancre de la carte, et clé de suivi. */
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly fields: readonly VitrineField[];
}

const ALWAYS: VitrineFieldPresence = 'toujours';
const NULLABLE: VitrineFieldPresence = 'peut valoir null';
const OPTIONAL: VitrineFieldPresence = 'peut être absent';

export const VITRINE_ENTITIES: readonly VitrineEntity[] = [
  {
    key: 'catalogue',
    title: 'Le catalogue',
    subtitle: 'GET /vitrine/catalogue — la racine',
    fields: [
      {
        field: 'language',
        type: '"fr" | "en" | "it"',
        presence: ALWAYS,
        description: 'La langue demandée par ?lang= (fr par défaut).',
      },
      {
        field: 'shelves',
        type: 'Rayon[]',
        presence: ALWAYS,
        description: 'Les rayons. Tableau vide si vous ne recevez pas le catalogue.',
      },
      {
        field: 'items',
        type: 'Article[]',
        presence: ALWAYS,
        description:
          'Les articles en vente au public. Tableau vide si vous ne recevez pas le catalogue.',
      },
      {
        field: 'operations',
        type: 'Opération[]',
        presence: ALWAYS,
        description:
          'Les opérations datées en cours (Noël, Pâques…), la plus récemment annoncée d’abord. Vide hors saison, ou si vous ne recevez pas les opérations.',
      },
    ],
  },
  {
    key: 'shelf',
    title: 'Rayon',
    subtitle: 'une famille de produits, telle que la boutique la range',
    fields: [
      {
        field: 'id',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Identifiant du rayon. C’est la valeur de shelfId sur un article.',
      },
      {
        field: 'name',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Le nom, dans la langue demandée — en français s’il n’est pas traduit.',
      },
      {
        field: 'position',
        type: 'entier',
        presence: ALWAYS,
        description: 'L’ordre voulu par la maison. Triez par position, croissante.',
      },
    ],
  },
  {
    key: 'item',
    title: 'Article',
    subtitle: 'une référence en vente — GET /vitrine/articles/:sku',
    fields: [
      {
        field: 'sku',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'La référence de l’article. Stable : c’est votre clé.',
      },
      {
        field: 'name',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Le nom, dans la langue demandée — en français s’il n’est pas traduit.',
      },
      {
        field: 'note',
        type: 'chaîne',
        presence: NULLABLE,
        description:
          'La ligne sous le nom, traduite comme name. null : aucune n’est écrite, dans aucune langue.',
      },
      {
        field: 'image',
        type: 'Image',
        presence: NULLABLE,
        description: 'Le visuel principal (ouverture de fiche). null : pas de visuel.',
      },
      {
        field: 'thumbnail',
        type: 'Image',
        presence: NULLABLE,
        description:
          'La vignette de rayon, cadrée serré pour une grille. null : utilisez image à la place.',
      },
      {
        field: 'unitPriceMillicents',
        type: 'entier',
        presence: ALWAYS,
        description:
          'Prix d’une pièce HORS TAXE, en MILLICENTIMES (1 € = 100 000). Promotions publiques en cours comprises.',
      },
      {
        field: 'unitPriceTtcCents',
        type: 'entier',
        presence: ALWAYS,
        description:
          'Prix d’une pièce TOUTES TAXES COMPRISES, en CENTIMES (1 € = 100). Calculé par nos soins avec les arrondis de la caisse : à afficher tel quel au particulier, sans le recalculer.',
      },
      {
        field: 'catalogPriceMillicents',
        type: 'entier',
        presence: OPTIONAL,
        description:
          'Le prix à barrer, en millicentimes, même unité que unitPriceMillicents. Présent seulement quand le prix servi est plus bas (une promotion court) ; absent sinon.',
      },
      {
        field: 'vatRatePercent',
        type: 'nombre',
        presence: ALWAYS,
        description: 'Le taux de TVA en pourcentage : 5.5, 10, 20.',
      },
      {
        field: 'shelfId',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Le rayon de l’article (Rayon.id).',
      },
      {
        field: 'isFeatured',
        type: 'booléen',
        presence: OPTIONAL,
        description:
          '« Incontournable » : la pièce à ne pas noyer dans son rayon. Absent si vous ne recevez pas les Incontournables.',
      },
      {
        field: 'audience',
        type: '"public" | "both"',
        presence: ALWAYS,
        description:
          'À qui l’article se vend. both se lit « aussi pour les professionnels ». Un article réservé aux pros ne vous est jamais servi.',
      },
      {
        field: 'operation',
        type: 'Lien d’opération',
        presence: OPTIONAL,
        description:
          'Présent seulement pour un article vendu uniquement pendant une opération, et si vous recevez les opérations.',
      },
    ],
  },
  {
    key: 'image',
    title: 'Image',
    subtitle: 'image et thumbnail d’un article',
    fields: [
      {
        field: 'url',
        type: 'chaîne (URL)',
        presence: ALWAYS,
        description: 'L’adresse du fichier.',
      },
      {
        field: 'alt',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Le texte alternatif — en français, quelle que soit la langue demandée.',
      },
      {
        field: 'width',
        type: 'entier',
        presence: NULLABLE,
        description: 'Largeur en pixels, pour réserver la place. null : non mesurée (jamais 0).',
      },
      {
        field: 'height',
        type: 'entier',
        presence: NULLABLE,
        description: 'Hauteur en pixels. null : non mesurée.',
      },
      {
        field: 'focal',
        type: 'Point focal',
        presence: OPTIONAL,
        description: 'Le point autour duquel recadrer. Absent ou null : recadrez au centre.',
      },
    ],
  },
  {
    key: 'focal',
    title: 'Point focal',
    subtitle: 'pour object-position',
    fields: [
      {
        field: 'x',
        type: 'nombre de 0 à 1',
        presence: ALWAYS,
        description: 'Fraction de la largeur, depuis la gauche.',
      },
      {
        field: 'y',
        type: 'nombre de 0 à 1',
        presence: ALWAYS,
        description: 'Fraction de la hauteur, depuis le haut.',
      },
    ],
  },
  {
    key: 'item-operation',
    title: 'Lien d’opération',
    subtitle: 'operation d’un article',
    fields: [
      {
        field: 'key',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'La clé de l’opération (Opération.key).',
      },
      {
        field: 'state',
        type: '"announced" | "open" | "closed"',
        presence: ALWAYS,
        description: 'Annoncée, commandes ouvertes, commandes closes — à l’heure de notre serveur.',
      },
    ],
  },
  {
    key: 'operation',
    title: 'Opération',
    subtitle: 'une opération datée — Noël, Pâques, la galette',
    fields: [
      {
        field: 'key',
        type: 'chaîne',
        presence: ALWAYS,
        description: 'Sa clé, jamais réemployée.',
      },
      {
        field: 'name',
        type: 'Texte en langues',
        presence: ALWAYS,
        description: 'Le nom, dans toutes les langues saisies — ne dépend pas de ?lang=.',
      },
      {
        field: 'lede',
        type: 'Texte en langues',
        presence: NULLABLE,
        description: 'Le chapeau. null : aucun.',
      },
      {
        field: 'image',
        type: 'objet { url, alt, focal? }',
        presence: NULLABLE,
        description: 'La bannière : url, alt et point focal facultatif. null : aucune.',
      },
      {
        field: 'state',
        type: '"announced" | "open" | "closed"',
        presence: ALWAYS,
        description: 'L’état, calculé à l’horloge de notre serveur.',
      },
      {
        field: 'orderFrom',
        type: 'chaîne (instant ISO 8601)',
        presence: ALWAYS,
        description: 'Ouverture des commandes.',
      },
      {
        field: 'orderUntil',
        type: 'chaîne (instant ISO 8601)',
        presence: ALWAYS,
        description: 'Clôture des commandes.',
      },
      {
        field: 'pickupFrom',
        type: 'chaîne (AAAA-MM-JJ)',
        presence: ALWAYS,
        description: 'Premier jour de retrait.',
      },
      {
        field: 'pickupUntil',
        type: 'chaîne (AAAA-MM-JJ)',
        presence: ALWAYS,
        description: 'Dernier jour de retrait.',
      },
      {
        field: 'skus',
        type: 'chaîne[]',
        presence: ALWAYS,
        description:
          'Les articles du rayon de l’opération, dans l’ordre voulu — tous présents dans items. Peut être vide pendant l’annonce.',
      },
      {
        field: 'announceFrom',
        type: 'chaîne (instant ISO 8601)',
        presence: OPTIONAL,
        description: 'L’instant de l’annonce.',
      },
      {
        field: 'awaitingProducts',
        type: 'booléen',
        presence: OPTIONAL,
        description:
          'true : commandes ouvertes mais rayon encore vide (« les produits arrivent »).',
      },
      {
        field: 'showsOrderUntilTime',
        type: 'booléen',
        presence: OPTIONAL,
        description: 'true : annoncez la clôture avec l’heure ; false ou absent : le jour seul.',
      },
    ],
  },
  {
    key: 'localized-text',
    title: 'Texte en langues',
    subtitle: 'name et lede d’une opération',
    fields: [
      { field: 'fr', type: 'chaîne', presence: ALWAYS, description: 'Le français, toujours.' },
      {
        field: 'en',
        type: 'chaîne',
        presence: OPTIONAL,
        description: 'L’anglais, s’il est saisi.',
      },
      {
        field: 'it',
        type: 'chaîne',
        presence: OPTIONAL,
        description: 'L’italien, s’il est saisi.',
      },
    ],
  },
  {
    key: 'texts',
    title: 'Les textes',
    subtitle: 'GET /vitrine/textes',
    fields: [
      {
        field: 'language',
        type: '"fr" | "en" | "it"',
        presence: ALWAYS,
        description: 'La langue demandée.',
      },
      {
        field: 'texts',
        type: 'objet clé → chaîne',
        presence: ALWAYS,
        description:
          'Les textes de la boutique tels qu’elle les affiche (ex. product.bestSeller → « Incontournable »). Objet vide si vous ne recevez pas les textes.',
      },
    ],
  },
];

/** Le corps d'une notification, puis ses deux listes. */
export const VITRINE_NOTIFICATION_FIELDS: readonly VitrineField[] = [
  {
    field: 'subscriber',
    type: 'chaîne',
    presence: ALWAYS,
    description: 'Votre identifiant d’abonné chez nous.',
  },
  {
    field: 'sequence',
    type: 'entier',
    presence: ALWAYS,
    description: 'Croît d’une notification à l’autre pour un même abonné. 0 pour un essai.',
  },
  {
    field: 'at',
    type: 'chaîne (instant ISO 8601)',
    presence: ALWAYS,
    description: 'Dernière mise à jour de la livraison — peut changer d’un essai à l’autre.',
  },
  {
    field: 'test',
    type: 'true',
    presence: OPTIONAL,
    description: 'Présent (et vrai) seulement sur un essai envoyé depuis notre écran.',
  },
  {
    field: 'changed',
    type: 'Clés par ensemble',
    presence: ALWAYS,
    description: 'Ce qui est apparu ou a changé : relisez-le.',
  },
  {
    field: 'removed',
    type: 'Clés par ensemble',
    presence: ALWAYS,
    description: 'Ce qui a disparu de votre vue : retirez-le.',
  },
];

export const VITRINE_ELEMENT_KEY_FIELDS: readonly VitrineField[] = [
  { field: 'items', type: 'chaîne[]', presence: ALWAYS, description: 'Des sku d’articles.' },
  {
    field: 'operations',
    type: 'chaîne[]',
    presence: ALWAYS,
    description: 'Des key d’opérations.',
  },
  { field: 'shelves', type: 'chaîne[]', presence: ALWAYS, description: 'Des id de rayons.' },
  { field: 'texts', type: 'chaîne[]', presence: ALWAYS, description: 'Des clés de textes.' },
];
