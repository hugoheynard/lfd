import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { FoldTabsComponent } from 'fold-ng';

import { HandoverQueueStore } from '../handover-queue.store';

/**
 * **La part du retrait dans la bande du comptoir** : le point ouvert, ce qui
 * s'y passe, l'heure, et la journée regardée.
 *
 * Un composant à part de la bande (`app-comptoir-masthead`) pour une raison qui
 * n'est pas cosmétique : c'est lui, et lui seul, qui injecte
 * `HandoverQueueStore`. La bande ne le monte que pour `handover_counter:read` —
 * le poste qui ne tient que la commande pro n'instancie donc jamais la file, et
 * n'appelle pas l'API du retrait pour se prendre un 403.
 *
 * 🔴 Ni titre ni phrase d'explication : sur un poste de comptoir la hauteur est
 * ce qui manque. Ce que la bande fait se lit dans ce qu'elle montre.
 */
@Component({
  selector: 'app-handover-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldTabsComponent],
  templateUrl: './handover-masthead.html',
  styleUrl: './handover-masthead.scss',
})
export class HandoverMasthead {
  protected readonly store = inject(HandoverQueueStore);

  /** La barre d'onglets de point, telle que ce gabarit la rend. */
  private readonly tabBar = viewChild(FoldTabsComponent);

  constructor() {
    // Le `fold-tab-panel` de la vue Retrait réclame CETTE barre : elle est
    // publiée au store, une variable de gabarit ne franchissant pas deux
    // composants.
    this.store.attachTabBar(this.tabBar);
  }
}
