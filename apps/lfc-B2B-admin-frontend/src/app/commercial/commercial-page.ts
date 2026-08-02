import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

/**
 * Page **Commercial** : le poste de travail du commercial, structuré par un
 * `fold-view-nav` horizontal (barre d'onglets routés). Le premier onglet est
 * **Acquisition** (le calendrier du pipeline d'entrée) ; les suivants viendront
 * s'ajouter à la liste sans toucher au reste — chaque onglet est une route
 * enfant, `<router-outlet>` en dessous.
 */
@Component({
  selector: 'app-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldViewNavComponent],
  templateUrl: './commercial-page.html',
  styleUrl: './commercial-page.scss',
})
export class CommercialPage {
  /** Onglets routés — chaque `link` est relatif à `/commercial`. */
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'acquisition', label: 'Acquisition', link: 'acquisition', icon: 'calendar' },
  ];
}
