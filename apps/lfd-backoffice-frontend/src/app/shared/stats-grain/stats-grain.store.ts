import { Injectable, signal } from '@angular/core';

import { isStatsGrain, type StatsGrain } from './stats-grain';

/**
 * La granularité **choisie**, partagée par tous les écrans de statistiques.
 *
 * Un service racine et non une entrée de composant : la temporalité n'appartient
 * pas à un graphe, elle appartient à la question qu'on est en train de se poser.
 * Passer de la fiche d'un client au tableau de bord commercial en gardant « à la
 * semaine » est la lecture normale ; ré-armer le réglage sur chaque écran
 * obligerait à le refaire à chaque pas.
 *
 * **En mémoire seulement.** Un rechargement repart au mois, qui est la lecture
 * par défaut d'une boulangerie. Le jour où ça pèse, la préférence se range dans
 * `nav_prefs` comme la vue catalogue — même mécanique, un aller-retour serveur ;
 * ce n'est pas la peine tant que personne ne s'en est plaint.
 */
@Injectable({ providedIn: 'root' })
export class StatsGrainStore {
  /** Le pas de temps courant. Le mois par défaut : la saison d'une boulangerie. */
  readonly grain = signal<StatsGrain>('month');

  /**
   * Pose la granularité depuis une valeur d'écran. Le segment sélectionné remonte
   * en `string` : on refuse ce qu'on ne connaît pas plutôt que de le forcer.
   */
  set(value: string): void {
    if (isStatsGrain(value)) {
      this.grain.set(value);
    }
  }
}
