import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * Mes commandes — le carnet de commandes du client pro connecté. Placeholder :
 * la liste + le détail se brancheront sur l'API commandes.
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCalloutComponent],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {}
