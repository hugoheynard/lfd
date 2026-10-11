import { z } from "zod";

import { mediaLibraryQuerySchema } from "./media.js";

/**
 * **La palette d'une image** — la frise des couleurs (plan L9, 2026-10-11).
 *
 * Calculée DANS LE NAVIGATEUR (R28) : l'API n'a aucun décodeur d'image. Elle
 * la reçoit, la revalide et la range ; elle ne la recalcule jamais. L'identité
 * d'une image est son contenu, donc sa palette ne change pas.
 *
 * Les bornes vivent ici, lues des deux côtés : l'écran pour ne pas envoyer
 * ce que le serveur refuserait, le domaine pour refuser.
 */
export const PALETTE_LIMITS = {
  /** Au plus huit entrées, dominantes et écarts confondus. */
  maxSwatches: 8,
  /**
   * La somme des parts des DOMINANTES doit tomber dans cette fourchette : un
   * arrondi par couleur ne doit pas faire refuser, une palette qui ne couvre
   * pas l'image si.
   */
  dominantShareMin: 0.95,
  dominantShareMax: 1.05,
} as const;

/** La borne d'entrées, nommée seule pour qui n'a besoin que d'elle. */
export const PALETTE_MAX_SWATCHES = PALETTE_LIMITS.maxSwatches;

/** `#rrggbb`, six chiffres hexadécimaux ; le domaine range en minuscules. */
export const PALETTE_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Une couleur de la palette. `share` est la part de l'image qu'elle couvre,
 * de 0 à 1 ; `outlier` dit un ÉCART (R29) plutôt qu'une dominante.
 */
export interface PaletteSwatch {
  readonly hex: string;
  readonly share: number;
  readonly outlier: boolean;
}

/** 1 à {@link PALETTE_MAX_SWATCHES} couleurs, dominantes d'abord. */
export type ImagePalette = readonly PaletteSwatch[];

export const paletteSwatchSchema = z.object({
  hex: z.string().regex(PALETTE_HEX_PATTERN, "couleur attendue au format #rrggbb"),
  share: z.number().min(0).max(1),
  outlier: z.boolean(),
});

/**
 * La palette telle qu'elle voyage. Le domaine (`imagePalette`) revalide les
 * mêmes règles : ce schéma ne fait que PRÉVENIR.
 */
export const imagePaletteSchema = z
  .array(paletteSwatchSchema)
  .min(1)
  .max(PALETTE_LIMITS.maxSwatches)
  .refine(
    (swatches) => {
      const total = swatches
        .filter((swatch) => !swatch.outlier)
        .reduce((sum, swatch) => sum + swatch.share, 0);
      return total >= PALETTE_LIMITS.dominantShareMin && total <= PALETTE_LIMITS.dominantShareMax;
    },
    { message: "la somme des parts des dominantes doit être comprise entre 0,95 et 1,05" },
  );

/** Le rattrapage — `PUT /media/palette`. */
export const mediaPalettePayloadSchema = z.object({
  url: z.string().min(1),
  palette: imagePaletteSchema,
});
export type MediaPalettePayload = z.infer<typeof mediaPalettePayloadSchema>;

/**
 * **La frise des couleurs** — `GET /media/palette-strip` (L9, 2026-10-11).
 *
 * Une lecture AGRÉGÉE : l'écran reçoit au plus `maxColumns` colonnes, quel que
 * soit le volume du fonds, plutôt qu'une palette par photo.
 */
export const PALETTE_STRIP_LIMITS = {
  maxColumns: 400,
  defaultColumns: 120,
} as const;

/**
 * Les MÊMES filtres que le feed (`GET /media`), sans page, curseur ni tri —
 * la frise est toujours chronologique — et le nombre de colonnes voulu.
 */
export const mediaPaletteStripQuerySchema = mediaLibraryQuerySchema
  .omit({ limit: true, offset: true, after: true, sort: true })
  .extend({
    columns: z.coerce
      .number()
      .int()
      .min(1)
      .max(PALETTE_STRIP_LIMITS.maxColumns)
      .default(PALETTE_STRIP_LIMITS.defaultColumns),
  });
export type MediaPaletteStripQuery = z.infer<typeof mediaPaletteStripQuerySchema>;

/**
 * Une colonne de la frise : une tranche CONSÉCUTIVE d'images, dans l'ordre de
 * la prise de vue (dépôt à défaut).
 *
 * `palette` peut être VIDE — aucune image de la tranche n'est encore peinte —
 * ce qu'une palette d'image ne peut pas être : d'où un schéma distinct.
 */
export const paletteStripColumnSchema = z.object({
  /** Date retenue de la première image de la colonne, ISO. */
  from: z.string(),
  /** Date retenue de la dernière image de la colonne, ISO. */
  to: z.string(),
  count: z.number().int().min(1),
  palette: z.union([imagePaletteSchema, z.array(paletteSwatchSchema).length(0)]),
  /** Une image de la tranche, pour l'aperçu au survol. */
  sampleUrl: z.string(),
});
export type PaletteStripColumnView = z.infer<typeof paletteStripColumnSchema>;

export const mediaPaletteStripViewSchema = z.object({
  columns: z.array(paletteStripColumnSchema).max(PALETTE_STRIP_LIMITS.maxColumns),
  /** Les images retenues par le filtre. */
  total: z.number().int().min(0),
  /** Parmi elles, celles qui n'ont pas encore de palette. */
  unpainted: z.number().int().min(0),
});
export type MediaPaletteStripView = z.infer<typeof mediaPaletteStripViewSchema>;
