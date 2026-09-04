import { z } from "zod";

/**
 * **La dérogation d'heure limite** — l'autorisation de passer une commande
 * arrivée après la limite, dans la fenêtre de rattrapage.
 *
 * Ce n'est **pas** une règle. Elle ne modifie ni le référentiel ni les réglages :
 * c'est une autorisation nommée, datée, bornée et tracée, qui vise **un client**
 * et **une journée d'acheminement**.
 *
 * ## Ce qu'elle ne porte pas, et pourquoi
 *
 * 🔴 **Pas d'heure à elle.** Sa borne est la **grâce**, et la garde ne la
 * consulte que dans cet état — une dérogation ne peut donc jamais ouvrir une
 * journée close, quoi qu'elle dise. Lui donner une heure propre aurait créé un
 * second moyen de dire la même chose, et le second aurait fini par dépasser le
 * premier. La borne n'est pas vérifiée, elle est **inexprimable**.
 *
 * 🔴 **Pas d'instant d'expiration.** Il aurait fallu l'aligner sur une fin de
 * grâce qui n'existe pas : depuis que chaque article porte sa limite, un panier
 * en a autant que de lignes. Une colonne aurait donc porté une approximation, et
 * une approximation dans un mécanisme d'exception finit toujours par être la
 * règle. Ce qui la périme est le calendrier : passé la grâce de la journée
 * qu'elle vise, elle ne peut plus rien ouvrir.
 *
 * ## Ce qu'elle porte, et pourquoi chacun compte
 *
 * - **une entreprise** — c'est le mur : une exception accordée par téléphone à
 *   un client ne peut pas ouvrir la porte aux autres ;
 * - **une journée d'acheminement** — pas « ce client est dispensé ». Une
 *   dispense permanente est un réglage, et elle doit se voir comme tel ;
 * - **un motif**, obligatoire. Une exception sans raison écrite devient la règle
 *   en trois mois, et personne ne sait dire quand ça a basculé ;
 * - **son auteur**, un `StaffUser.id` et pas une clé étrangère : une décision ne
 *   disparaît pas parce qu'on retire quelqu'un de l'annuaire.
 */

/** Une journée d'acheminement, `AAAA-MM-JJ`. */
export const waiverDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ");

/**
 * Ce qu'il faut pour accorder une dérogation.
 *
 * Le motif a un **minimum réel**, pas symbolique : « ok » n'explique rien, et
 * un champ qui accepte n'importe quoi ne fait que déplacer l'absence de raison
 * d'un endroit vide vers un endroit rempli.
 */
export const orderCutoffWaiverPayloadSchema = z.object({
  companyId: z.string().trim().min(1, "société requise"),
  fulfillmentDate: waiverDateSchema,
  reason: z.string().trim().min(5, "motif requis").max(500),
});
export type OrderCutoffWaiverPayload = z.infer<typeof orderCutoffWaiverPayloadSchema>;

/** Une dérogation telle qu'elle se relit. */
export interface OrderCutoffWaiverView {
  readonly id: string;
  readonly companyId: string;
  readonly fulfillmentDate: string;
  readonly reason: string;
  /** L'identifiant du membre de l'équipe qui l'a accordée. */
  readonly grantedByStaffId: string;
  readonly grantedAt: string;
  /**
   * La commande qui s'en est servie, ou `null` — elle attend encore.
   *
   * **Consommée, pas supprimée** : une dérogation accordée puis non utilisée est
   * une information de gestion, et celle qui a servi doit pouvoir être reliée à
   * ce qu'elle a laissé passer — c'est de là que viendra la surtaxe.
   */
  readonly usedByOrderId: string | null;
}
