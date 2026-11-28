import type { ProductionDay } from "../entities/production-day.js";

/**
 * **Le papier d'une version, demandé après la validation**
 * (`documentation/fournil/les-versions-du-plan.md`).
 *
 * Le noyau écrit la version ; le papier (dossier, compte à produire) est au
 * plan, qui l'implémente. L'écrivain des versions l'appelle sous le verrou,
 * dans la transaction du geste : l'implémentation ne fait rien sur-le-champ,
 * elle inscrit le rendu et le rangement **après le `COMMIT`**, hors
 * transaction. Un geste annulé ne fabrique donc rien, et un papier qui
 * échoue est journalisé sans rien retenir : le geste est déjà validé, et la
 * lecture suivante reprendra tant que la version est la courante.
 *
 * Seulement pour une version qui a un papier propre : un retrait ne change ni
 * les commandes ni le compte (§ 1.14), l'écrivain ne l'appelle pas.
 */
export abstract class PlanVersionPaper {
  /** `day` porte déjà son numéro de version : c'est sous lui que le papier se range. */
  abstract requestAfterCommit(day: ProductionDay): void;
}
