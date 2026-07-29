import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * Tableau de bord B2B — page d'accueil de l'espace pro. Placeholder pour
 * l'instant : les widgets (commandes du jour, encours, clients actifs) se
 * brancheront quand le backend existera.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCalloutComponent],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {}
