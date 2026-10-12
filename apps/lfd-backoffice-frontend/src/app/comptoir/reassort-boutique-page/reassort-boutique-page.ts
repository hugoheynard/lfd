import { ComptoirTabs } from '../comptoir-tabs/comptoir-tabs';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldEmptyStateComponent, FoldIconComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Le réassort boutique** — pas encore construit (2026-10-12).
 *
 * L'onglet existe pour que le poste du comptoir sache où il sera ; l'écran le
 * dit, sans logique ni appel.
 */
@Component({
  selector: 'app-reassort-boutique-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComptoirTabs, FoldPageLayoutComponent, FoldEmptyStateComponent, FoldIconComponent],
  templateUrl: './reassort-boutique-page.html',
})
export class ReassortBoutiquePage {}
