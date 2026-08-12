import type { ActivityActorType } from "../activity-event.js";

/**
 * Comment s'appelle celui qui agit, **au moment où il agit**.
 *
 * Port **étroit** (ISP) : le journal n'a besoin que d'un nom à figer, pas de
 * l'annuaire staff ni du profil client. `growth/` déclare donc sa propre
 * dépendance plutôt que d'importer le port d'`account/` — les deux contextes
 * poseraient la même question pour des raisons différentes, et celui-ci a le
 * droit de répondre « je ne sais pas » sans casser quoi que ce soit.
 *
 * `null` n'est pas une erreur : acteur `system`, `sub` de développement, ou
 * fiche non provisionnée. Le journal affiche alors la **nature** de l'acteur
 * (« un membre du staff ») — ce qui reste vrai — plutôt qu'un nom inventé ou un
 * identifiant technique au milieu d'une phrase.
 */
export abstract class ActorNamer {
  abstract nameOf(type: ActivityActorType, id: string | null): Promise<string | null>;
}
