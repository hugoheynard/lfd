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

/**
 * La même chose, mais entièrement facultative — un champ qu'on peut ne pas
 * remplir.
 *
 * `nullish` et non `optional` : un écran qui enregistre une SECTION entière
 * envoie ce qu'il affiche, et un champ vide y est `null`, pas absent. La forme
 * `optional` seule refusait ces `null` en 400 — « expected record, received
 * null » — donc la section Communication ne s'enregistrait plus du tout dès
 * qu'un champ facultatif était laissé vide, c'est-à-dire presque toujours.
 *
 * Les deux formes de l'absence sont ramenées à `undefined` ICI, une fois : le
 * value-object en aval n'en connaît qu'une, et lui en faire connaître deux
 * aurait dispersé la question dans chaque champ.
 */
export const optionalLocalizedTextSchema = z.preprocess(
  // `preprocess` et non `transform` : le `null` est ramené à « absent » AVANT
  // la validation, si bien que le type de sortie reste exactement celui d'un
  // champ facultatif. Un `transform` en aval aurait rendu la clé « présente et
  // peut-être indéfinie », ce qui casse les appelants qui construisent un objet
  // partiel — et le contrat n'a aucune raison de leur imposer ça pour accepter
  // une forme d'entrée de plus.
  (value) => value ?? undefined,
  localizedTextSchema.optional(),
);
