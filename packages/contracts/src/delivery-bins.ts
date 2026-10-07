import { z } from "zod";

/**
 * **Les bacs de la livraison** — le catalogue des types de bacs et leurs
 * contenances (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 4 bis, v2-1 et v2-2, tranche A). Ce sont des réglages du bloc
 * `delivery` : ni la fiche produit du référentiel, ni la table commerce
 * `delivery_settings`.
 *
 * Routes (`admin/livraison/…`) — lecture `delivery_settings:read` OU
 * `delivery_rounds:read`, écriture `delivery_settings:write` :
 *
 * - `GET bacs` → {@link BinTypesView} ; `POST bacs` ({@link BinTypePayload}) →
 *   `{ id }` ; `PUT bacs/:id` (fiche complète) → 204 ;
 *   `POST bacs/:id/archiver` et `POST bacs/:id/reactiver` → 204 ;
 * - `GET contenances` → {@link BinCapacitiesView} ; `PUT contenances`
 *   ({@link SetBinCapacityPayload}, une case à la fois) → 204.
 *
 * Les BORNES ci-dessous sont tenues par le domaine, qui refuse avec la phrase à
 * lire (400) : les schémas ne vérifient que la forme (entiers, booléens), et
 * l'écran peut s'aider des constantes pour guider la saisie.
 *
 * ## Les faits au journal
 *
 * Sujet `delivery_bin_type` (identifiant du type), `subjectLabel` = son nom au
 * moment du geste. `BinTypeSpec` = `{ name, outer, inner, isotherm, maxStack,
 * divisible }` (dimensions `{ lengthMm, widthMm, heightMm }` depuis le
 * 2026-10-07 ; les faits d'avant portent `{ lengthCm, widthCm, heightCm }`) :
 *
 * - `delivery_bin_type.added` — `{ subjectLabel, bin: BinTypeSpec }` ;
 * - `delivery_bin_type.corrected` — `{ subjectLabel, before: BinTypeSpec, after: BinTypeSpec }` ;
 * - `delivery_bin_type.archived` — `{ subjectLabel, bin: BinTypeSpec }` ;
 * - `delivery_bin_type.reactivated` — `{ subjectLabel, bin: BinTypeSpec }` ;
 * - `delivery_bin_capacity.set` — même sujet (le type de bac) :
 *   `{ subjectLabel, sku: string, before: number | null, after: number | null }`
 *   (`null` = aucune contenance ; `after: null` = retirée).
 */

/** Le nom tient sur une étiquette de grille. */
export const BIN_TYPE_NAME_MAX_LENGTH = 60;
/**
 * Une dimension de bac — type, candidat de la bibliothèque d'achat ou format
 * de l'assistant —, en millimètres entiers (2026-10-07 : une manne à pain
 * mesure 66,5 cm) — les mêmes bornes que 1–300 cm.
 */
export const BIN_TYPE_DIMENSION_MIN_MM = 10;
export const BIN_TYPE_DIMENSION_MAX_MM = 3000;
/** Le nombre de bacs dans une pile. */
export const BIN_MAX_STACK_MIN = 1;
export const BIN_MAX_STACK_MAX = 20;
/** Les unités d'un produit dans un bac ENTIER. */
export const BIN_CAPACITY_MIN_UNITS = 1;
export const BIN_CAPACITY_MAX_UNITS = 10_000;

/**
 * Trois dimensions d'un bac, en millimètres entiers (bornes au domaine) — une
 * seule unité côté bacs depuis le 2026-10-07 : type, candidat, format essayé.
 */
export const binDimensionsSchema = z.object({
  lengthMm: z.number().int(),
  widthMm: z.number().int(),
  heightMm: z.number().int(),
});
export type BinDimensions = z.infer<typeof binDimensionsSchema>;

/** Le même schéma, sous le nom que lui donnent les types de bacs. */
export const binTypeDimensionsSchema = binDimensionsSchema;
export type BinTypeDimensions = BinDimensions;

/**
 * Charge d'un type de bac, à la création comme à la correction — la fiche
 * COMPLÈTE. `outer` sert au chargement ; `inner` est informatif et ne dépasse
 * `outer` dans aucune dimension (refus du domaine).
 */
export const binTypePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nom du type de bac requis")
    .max(BIN_TYPE_NAME_MAX_LENGTH, "nom trop long (60 caractères au plus)"),
  outer: binTypeDimensionsSchema,
  inner: binTypeDimensionsSchema,
  isotherm: z.boolean(),
  maxStack: z.number().int(),
  divisible: z.boolean(),
});
export type BinTypePayload = z.infer<typeof binTypePayloadSchema>;

/** Un type de bac. */
export interface BinTypeView {
  readonly id: string;
  readonly name: string;
  /** En millimètres entiers. */
  readonly outer: BinTypeDimensions;
  readonly inner: BinTypeDimensions;
  /** DÉRIVÉ de `inner` (L × l × h en mm³ / 1 000 000, arrondi à l'inférieur) : jamais saisi ni stocké. */
  readonly innerVolumeLiters: number;
  readonly isotherm: boolean;
  readonly maxStack: number;
  /** Accepte une cloison : deux demi-bacs. */
  readonly divisible: boolean;
  /** Archivé le, ou `null`. Un type n'est jamais supprimé ; archivé, il n'est plus proposé. */
  readonly archivedAt: string | null;
}

/** Le catalogue des bacs, archivés compris, dans l'ordre de création. */
export interface BinTypesView {
  readonly types: readonly BinTypeView[];
}

/** Un produit vendu, tel que la livraison le connaît : SKU opaque et nom. */
export interface BinProductView {
  readonly sku: string;
  readonly name: string;
  /**
   * Le produit demande le froid (fiche du référentiel, relayée par le canal
   * commerce) : il ne va que dans un bac isotherme. `false` n'affirme rien —
   * c'est la valeur d'un produit que personne n'a encore qualifié.
   */
  readonly requiresCold: boolean;
}

/** Une case de la grille : un bac ENTIER de ce type contient `units` unités de ce produit. */
export interface BinCapacityView {
  readonly binTypeId: string;
  readonly sku: string;
  readonly units: number;
}

/**
 * La grille bacs × produits. `products` : le catalogue B2B vendu (relayé par le
 * commerce, jamais lu au référentiel) ; `types` : les types NON archivés ;
 * `capacities` : les cases renseignées de ces types — une case absente n'a
 * pas de contenance, et le colisage la signalera au lieu de la deviner.
 */
export interface BinCapacitiesView {
  readonly products: readonly BinProductView[];
  readonly types: readonly BinTypeView[];
  readonly capacities: readonly BinCapacityView[];
}

/** Pose (`units`) ou retire (`null`) UNE contenance. */
export const setBinCapacityPayloadSchema = z.object({
  binTypeId: z.string().trim().min(1, "type de bac requis"),
  sku: z.string().trim().min(1, "produit requis").max(120, "SKU trop long"),
  units: z.number().int().nullable(),
});
export type SetBinCapacityPayload = z.infer<typeof setBinCapacityPayloadSchema>;
