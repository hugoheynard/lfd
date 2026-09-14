/**
 * **Un pas de container** — en ajouter un, ou en retirer un, à une commande.
 *
 * Un sens et jamais un total, et c'est tout l'objet (décidé le 2026-09-14) : un
 * total envoyé par l'écran perdait un container dès que deux postes appuyaient
 * sur « + » en même temps, puisque chacun envoyait le même nombre. Un sens se
 * compose : deux « + » simultanés font deux containers.
 *
 * Le type appartient au DOMAINE, et le contrat en publie un structurellement
 * identique (`PackingContainerStep`). Le domaine ne dépend pas d'un schéma Zod.
 */
export type ContainerStep = "add" | "remove";

/**
 * Le plafond d'une commande : **99 containers**.
 *
 * Ce n'est pas une contrainte de véhicule, c'est un garde-fou de saisie devenu
 * règle : il n'existe pas de commande à cent bacs, et un « + » qui part en
 * boucle doit buter sur un refus lisible plutôt que d'écrire un nombre que
 * personne ne relira. Le même nombre borne `setPackingContainersSchema` côté
 * contrat — les deux doivent bouger ensemble.
 */
export const MAX_CONTAINERS_PER_ORDER = 99;
