import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * Tableau de bord B2B — page d'accueil de l'espace pro. Les indicateurs
 * (dernières commandes, encours, réassorts) viendront ici une fois le backend
 * branché ; le suivi des commandes vit sur « Mes commandes ».
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCalloutComponent],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {}
