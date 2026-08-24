import { z } from "zod";

import { LOCALES, SOURCE_LOCALE, type LocalizedText } from "./shared.js";

/**
 * Le schéma d'un texte traduisible — **dérivé** de {@link LOCALES}, jamais
 * réécrit à côté. Ajouter une langue au catalogue ne touche donc pas ce fichier.
 *
 * `partialRecord` fait exactement les deux choses attendues : il accepte
 * n'importe quel sous-ensemble des locales connues, et il **refuse une clé
 * inconnue** — un `nameDe` envoyé par erreur est un 400, pas un champ ignoré
 * en silence.
 *
 * Le `refine` porte un prédicat de type, donc `z.infer` rend bien un
 * {@link LocalizedText} avec sa langue source garantie : la contrainte est
 * exprimée une fois, et le typage la suit sans conversion.
 */
export const localizedTextSchema = z
  .partialRecord(z.enum(LOCALES), z.string().trim().min(1))
  .refine((value): value is LocalizedText => typeof value[SOURCE_LOCALE] === "string", {
    message: `Le texte doit avoir une valeur en « ${SOURCE_LOCALE} ».`,
  });

/** La même chose, mais entièrement facultative — un champ qu'on peut ne pas remplir. */
export const optionalLocalizedTextSchema = localizedTextSchema.optional();
