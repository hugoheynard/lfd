import { z } from "zod";

/**
 * Contrat de fil de la **saisie particulier au comptoir** : retrouver LA
 * personne, ou créer sa fiche explicitement
 * (`documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`, § 3).
 *
 * Servi sous le droit de passation de l'équipe (`b2b_place_order:write`). Un
 * vendeur y lit des particuliers qu'il ne connaît pas : l'e-mail et le
 * téléphone ne sortent qu'en partie masqués, assez pour reconnaître la
 * personne au téléphone, pas pour relever ses coordonnées.
 */

/** Bornes de la recherche : en deçà de deux caractères, tout le monde répond. */
export const COUNTER_PARTICULAR_SEARCH_MIN_LENGTH = 2;
export const COUNTER_PARTICULAR_SEARCH_MAX_LENGTH = 120;

/** La recherche : un téléphone, un prénom ou une partie d'adresse. */
export const counterParticularSearchQuerySchema = z.object({
  q: z.string().max(COUNTER_PARTICULAR_SEARCH_MAX_LENGTH),
});
export type CounterParticularSearchQuery = z.infer<typeof counterParticularSearchQuerySchema>;

/** Une carte de résultat : de quoi reconnaître, jamais de quoi recopier. */
export const counterParticularCardSchema = z.object({
  id: z.string().min(1),
  firstName: z.string(),
  /** Vide pour un invité : la boutique ne demande pas de nom de famille. */
  lastName: z.string(),
  /** En partie masquée : `j***@gmail.com`. */
  maskedEmail: z.string(),
  /** En partie masqué : `06 •• •• •• 12` ; vide si la fiche n'en a pas. */
  maskedPhone: z.string(),
  /** `true` : un compte où la personne se connecte ; `false` : une fiche invitée. */
  connectable: z.boolean(),
});
export type CounterParticularCard = z.infer<typeof counterParticularCardSchema>;

/** La création explicite d'une fiche invitée : les trois champs sont exigés. */
export const counterParticularCreatePayloadSchema = z.object({
  firstName: z.string().max(200),
  email: z.string().max(320),
  phone: z.string().max(60),
});
export type CounterParticularCreatePayload = z.infer<typeof counterParticularCreatePayloadSchema>;
