import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  FoldButtonComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { CommercialSettingsPanel } from './settings/commercial-settings-panel';

/**
 * Page **Commercial** : le poste de travail du commercial. Toute la page est un
 * `fold-page-layout` (titre, gouttières, rythme) dont le corps porte un
 * `fold-view-nav` horizontal (barre d'onglets routés) puis le `<router-outlet>`.
 * Le premier onglet est **Acquisition** (le calendrier du pipeline d'entrée) ;
 * un bouton **Réglages** dans l'en-tête ouvre le panneau des seuils d'alerte.
 */
@Component({
  selector: 'app-commercial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldViewNavComponent, FoldButtonComponent],
  templateUrl: './commercial-page.html',
  styleUrl: './commercial-page.scss',
})
export class CommercialPage {
  private readonly panels = inject(FoldPanelHostService);

  /** Onglets routés — chaque `link` est relatif à `/commercial`. */
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'acquisition', label: 'Acquisition', link: 'acquisition', icon: 'calendar' },
  ];

  /** Ouvre le panneau des réglages commerciaux (seuils d'alerte acquisition). */
  protected openSettings(): void {
    this.panels.open(CommercialSettingsPanel, { width: 'sm' });
  }
}
