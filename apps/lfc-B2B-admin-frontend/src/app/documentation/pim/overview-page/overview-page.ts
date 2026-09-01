import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldCardComponent, FoldPageLayoutComponent } from 'fold-ng';

import { SystemDiagram } from '../../system-diagram/system-diagram';

/**
 * **Vue d'ensemble** — la première page de la documentation, et la porte du
 * rail : elle dit ce qu'est le référentiel avant que les suivantes disent
 * comment il marche.
 */
@Component({
  selector: 'app-doc-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCardComponent, FoldCalloutComponent, SystemDiagram],
  templateUrl: './overview-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocOverviewPage {}
