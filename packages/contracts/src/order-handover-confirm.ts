import { z } from "zod";

/** Au-delà, ce n'est plus un comptoir : une commande n'a pas dix envois prêts. */
export const HANDOVER_RANKS_MAX = 10;

/**
 * **Les envois qu'on remet d'un geste** (plan E7 reliquat, choix 13, lot L4c)
 * — le corps de `POST /admin/handover/:token` et `POST
 * /admin/handover/manual/:reference`.
 *
 * `ranks` absent : l'envoi que la vue montrait, comme avant L4c — un corps
 * vide `{}` reste valide, et **l'absence de corps aussi** : avant L4c ces deux
 * routes n'en lisaient aucun, et un appelant qui n'en envoie pas ne se casse
 * pas (un onglet resté ouvert, un script).
 * Présent : chaque rang coché, remis dans une seule transaction, une
 * attestation par envoi. Le contrat ne vérifie que la forme ; qu'un rang soit
 * prêt, le serveur le juge.
 */
export const confirmHandoverPayloadSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    ranks: z
      .array(z.number().int().min(1))
      .min(1)
      .max(HANDOVER_RANKS_MAX)
      .refine((ranks) => new Set(ranks).size === ranks.length, {
        message: "Un envoi ne se coche qu'une fois.",
      })
      .optional(),
  }),
);
export type ConfirmHandoverPayload = z.infer<typeof confirmHandoverPayloadSchema>;
