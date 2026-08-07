import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldPageLayoutComponent, FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

/**
 * Page **Commercial** : le poste de travail du commercial. Toute la page est un
 * `fold-page-layout` (titre, gouttières, rythme) dont le corps porte un
 * `fold-view-nav` horizontal (barre d'onglets routés) puis le `<router-outlet>`.
 * Le premier onglet est le **Tableau de bord** (cockpit : les 5 meilleurs coups
 * du jour). Les seuils d'alerte se règlent dans **Réglages → Commercial**.
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
    { key: 'cockpit', label: 'Tableau de bord', link: 'cockpit', icon: 'layout-dashboard' },
    { key: 'prospects', label: 'Prospects', link: 'prospects', icon: 'users' },
    {
      key: 'activation',
      label: 'Activation & frictions',
      link: 'activation',
      icon: 'check-circle',
    },
    { key: 'croissance', label: 'Croissance', link: 'croissance', icon: 'trending-up' },
    { key: 'acquisition', label: 'Acquisition', link: 'acquisition', icon: 'calendar' },
  ];
}
