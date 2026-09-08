import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FoldAsideLayoutComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import { CustomerSheet } from '../../commercial/calendrier/customer-sheet/customer-sheet';
import { CustomerTimeline } from '../../commercial/calendrier/customer-timeline/customer-timeline';
import { ClientSheetStore } from '../client-sheet.store';

/**
 * **Tableau de bord** d'un compte : ce que le commercial regarde avant d'appeler
 * — les chiffres et les dernières commandes au centre, l'**historique
 * d'interaction** dans le rail collant, comme sur la fiche rendez-vous.
 *
 * C'est la fiche commerciale construite pour la page rendez-vous, réemployée
 * telle quelle : elle était déjà présentationnelle (elle reçoit sa vue, elle ne
 * la charge pas), donc elle n'a rien coûté à déplacer. Une seule lecture du
 * compte, deux endroits où elle sert.
 *
 * 🔴 **Elle ne charge plus rien.** La coquille lit la fiche pour son en-tête ;
 * cette vue la lisait une seconde fois, sur la même route, pour la même donnée.
 * Deux appels par ouverture d'écran, et un en-tête qui pouvait afficher des
 * chiffres pendant que le centre montrait encore son squelette. Le magasin de la
 * coquille est la source, et `(changed)` le fait relire — pour les deux.
 */
@Component({
  selector: 'app-client-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CustomerSheet,
    CustomerTimeline,
    FoldAsideLayoutComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './dashboard-page.html',
})
export class ClientDashboardPage {
  private readonly store = inject(ClientSheetStore);

  protected readonly state = this.store.state;
  protected readonly sheet = this.store.sheet;

  /**
   * Relit le compte après une modification faite depuis la fiche.
   *
   * L'identifiant vient du magasin, pas d'un `input` de route : c'est LUI qui
   * sait quel compte il porte, et le redemander à la route ouvrirait la porte à
   * un rechargement du mauvais dossier pendant une navigation.
   */
  protected async load(): Promise<void> {
    await this.store.reload();
  }
}
