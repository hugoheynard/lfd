import { z } from "zod";

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
