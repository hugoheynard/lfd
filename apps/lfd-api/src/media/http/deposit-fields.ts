import { z } from "zod";
import { imagePaletteSchema } from "@lfd/pim-contracts";

/**
 * Les champs texte du dépôt multipart — la forme seulement.
 *
 * `palette` (L9, 2026-10-11) arrive en CHAÎNE JSON : un multipart ne porte que
 * du texte. Une chaîne illisible est un 400 nommé, pas un 500 de `JSON.parse`.
 */
export const depositFieldsSchema = z.object({
  seriesId: z
    .string()
    .optional()
    .transform((raw) => (raw === undefined || raw.trim() === "" ? undefined : raw.trim())),
  palette: z
    .string()
    .optional()
    .transform((raw, ctx): unknown => {
      if (raw === undefined || raw.trim() === "") {
        return undefined;
      }
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: "custom", message: "palette illisible : JSON attendu" });
        return z.NEVER;
      }
    })
    .pipe(imagePaletteSchema.optional()),
});
export type DepositFields = z.infer<typeof depositFieldsSchema>;
