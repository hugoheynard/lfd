import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { CanDirective } from '../../shared/can/can.directive';
import { PendingDeliveryStore } from '../reception/pending-delivery.store';
import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace B2B** — ce que la plateforme client vend, et à quel prix.
 *
 * Ses deux écrans vivaient dans les Réglages, entre les heures de retrait et la
 * facturation. Ils n'y étaient pas à leur place : on ne va pas dans les réglages
 * pour travailler, on y va pour paramétrer une fois — alors que le catalogue et
 * la tarification B2B se regardent et se reprennent tous les jours. Rangés là,
 * ils se disaient plus petits que ce qu'ils sont.
 *
 * Comme le PIM, l'espace occupe le deuxième étage de la navigation de fold —
 * app → espace de travail → vues en page. Ses vues vivent dans le CATALOGUE et
 * non ici : le lanceur mobile en a besoin alors même qu'on n'y est pas.
 *
 * ## Le bandeau d'arrivée
 *
 * Une livraison du référentiel n'est **pas en vente** tant que personne ne l'a
 * relue : c'est tout l'objet de la boîte de réception. Mais rien ne le disait
 * ailleurs que sur l'écran de réception lui-même — donc à qui l'ouvrait, donc à
 * personne. On pouvait reprendre la tarification une semaine durant à côté d'une
 * arrivée en attente, sans la voir.
 *
 * Le bandeau vit ICI plutôt que dans chaque page : c'est la coquille de tout
 * `b2b/*`, elle rend sous l'en-tête de l'application, et il n'y a donc qu'un
 * seul endroit à tenir. Il disparaît de lui-même quand l'arrivée est validée —
 * l'écran de réception mute le MÊME signal.
 */
@Component({
  selector: 'app-b2b-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, FoldCalloutComponent, FoldButtonComponent, CanDirective],
  templateUrl: './b2b-page.html',
})
export class B2bPage {
  private readonly catalogue = inject(WorkspaceCatalogue);
  private readonly deliveries = inject(PendingDeliveryStore);

  protected readonly pending = this.deliveries.pending;

  /**
   * Combien de changements attendent, dit au singulier ou au pluriel.
   *
   * Le nombre plutôt qu'un « une livraison est arrivée » : trois changements et
   * cent quarante n'appellent pas le même moment de la journée, et c'est la
   * seule chose que le bandeau peut apprendre sans ouvrir l'écran.
   */
  protected readonly summary = computed(() => {
    const count = this.pending()?.changes.length ?? 0;
    return `${String(count)} changement${count > 1 ? 's' : ''}`;
  });

  /**
   * **Une correction d'allergène ne se dit pas en bleu.**
   *
   * `carriesAllergenChange` est décrit par le contrat comme « le seul motif qui
   * fasse sonner la cloche : une arrivée peut attendre indéfiniment sans que
   * rien ne casse, sauf une correction d'allergène qui dormirait ». L'écran de
   * réception l'affiche déjà en `alert` ; un bandeau calme sur le chemin qui y
   * mène contredirait la même doctrine à deux écrans d'écart.
   */
  protected readonly variant = computed(() =>
    this.pending()?.carriesAllergenChange === true ? 'alert' : 'info',
  );

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('b2b'));
    // En silence : la coquille ne peut rien faire d'une erreur, et un bandeau
    // fantôme enverrait sur un écran vide (cf. `PendingDeliveryStore`).
    void this.deliveries.refreshQuietly();
  }
}
