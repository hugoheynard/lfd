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
  // Les icônes viennent du catalogue FOLD (86 noms). Quatre d'entre elles
  // portaient des noms lucide (`layout-dashboard`, `users`, `check-circle`,
  // `trending-up`) : `FoldIconName` accepte n'importe quelle chaîne, donc elles
  // compilaient et ne s'affichaient pas.
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'cockpit', label: 'Tableau de bord', link: 'cockpit', icon: 'grid' },
    // « Activation & frictions » a fusionné ici : ce n'était pas un second sujet
    // mais le second étage du même parcours (cf. la bascule dans la page).
    { key: 'prospects', label: 'Prospects', link: 'prospects', icon: 'team' },
    { key: 'croissance', label: 'Croissance', link: 'croissance', icon: 'stats' },
    { key: 'calendrier', label: 'Calendrier', link: 'calendrier', icon: 'calendar' },
  ];
}
