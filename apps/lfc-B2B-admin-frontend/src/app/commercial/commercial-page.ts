import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldPageLayoutComponent, FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

/**
 * Page **Commercial** : le poste de travail du commercial. Toute la page est un
 * `fold-page-layout` (titre, gouttières, rythme) dont le corps porte un
 * `fold-view-nav` horizontal (barre d'onglets routés) puis le `<router-outlet>`.
 * Le premier onglet est **Acquisition** (le calendrier du pipeline d'entrée) ;
 * les suivants s'ajoutent à la liste `tabs` + une route enfant, sans toucher au
 * reste.
 */
@Component({
  selector: 'app-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldViewNavComponent],
  templateUrl: './commercial-page.html',
  styleUrl: './commercial-page.scss',
})
export class CommercialPage {
  /** Onglets routés — chaque `link` est relatif à `/commercial`. */
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'acquisition', label: 'Acquisition', link: 'acquisition', icon: 'calendar' },
  ];
}
