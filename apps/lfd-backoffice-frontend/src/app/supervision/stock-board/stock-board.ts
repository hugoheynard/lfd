import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  DayStockOverviewView,
  DayStockResupplyState,
  DayStockResupplyView,
  DayStockSiteView,
  ResupplyOrigin,
  StockAlertLevel,
} from '@lfd/contracts';
import type { FoldBadgeVariant, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { RESUPPLY_TARGET_LABELS } from '../../shared/resupply-labels';
import type { ColumnState } from '../column-state';

/** Ce que la Supervision montre : la journée (les trois colonnes) ou le stock. */
export type SupervisionView = 'day' | 'stock';

/** La bascule du bandeau (lot S1), en large comme en étroit. */
export const SUPERVISION_VIEWS: readonly FoldViewToggleOption[] = [
  { value: 'day', label: 'Journée' },
  { value: 'stock', label: 'Stock' },
];

/** Le badge de l'état d'un réassort : la clé de couleur de fold, et le mot. */
const STATE_BADGES: Readonly<Record<DayStockResupplyState, { status: string; label: string }>> = {
  sent: { status: 'coming-soon', label: 'Envoyé' },
  frozen: { status: 'terminated', label: 'Figé au plan' },
  // R4d : un « au plus tôt » lancé au fournil, puis parti avec sa tournée.
  launched: { status: 'in-progress', label: 'Lancé' },
  departed: { status: 'in-progress', label: 'Parti' },
  arrived: { status: 'pending', label: 'Arrivé' },
  received: { status: 'active', label: 'Réceptionné' },
};

const ORIGIN_LABELS: Readonly<Record<ResupplyOrigin, string>> = {
  counter: 'Comptoir',
  bakehouse: 'Fournil',
};

const ALERT_BADGES: Readonly<
  Record<StockAlertLevel, { variant: FoldBadgeVariant; label: string }>
> = {
  out_of_stock: { variant: 'alert', label: 'Rupture' },
  low: { variant: 'warning', label: 'Stock faible' },
};

/**
 * **L'onglet Stock de la Supervision** (lot S1,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-22) — une
 * `fold-card` par point, dans l'ordre des points : ses réassorts du jour en
 * tête (nom, visée, origine, état), puis la table de ses produits (stock
 * réceptionné, alerte vivante, attendu). Le serveur trie ; l'écran lit.
 *
 * Lecture seule : le seul renvoi mène à l'onglet Réassorts de Prod manager,
 * montré à qui en a le droit. Le comptoir agit depuis sa page.
 */
@Component({
  selector: 'app-stock-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldStatusBadgeComponent,
    RouterLink,
  ],
  templateUrl: './stock-board.html',
  styleUrl: './stock-board.scss',
})
export class StockBoard {
  private readonly permissions = inject(PermissionsStore);

  readonly state = input.required<ColumnState<DayStockOverviewView>>();
  readonly retry = output();

  /** Le droit de la route `/prod-manager/reassorts`, lu à chaque rendu : sans lui, pas de renvoi. */
  protected readonly canOpen = computed(
    () =>
      this.permissions.can('production_worksheet:read') ||
      this.permissions.can('production_plan:read'),
  );

  protected readonly stateBadges = STATE_BADGES;
  protected readonly alertBadges = ALERT_BADGES;
  protected readonly originLabels = ORIGIN_LABELS;
  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;

  protected titleOf(resupply: DayStockResupplyView): string {
    return resupply.name ?? this.targetLabels[resupply.target];
  }

  /** Un point que la table des points ne connaît plus garde son identifiant, pas un nom inventé. */
  protected siteTitle(site: DayStockSiteView): string {
    return site.siteLabel ?? site.siteId;
  }
}
