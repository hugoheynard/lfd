import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderItemLimitOverride, OrderLineView } from '@lfd/contracts';
import {
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
} from 'fold-ng';

/** Un dépassement, déjà mis en mots. */
interface OverrideRow {
  readonly product: string;
  readonly limit: string;
  readonly reason: string;
  readonly by: string;
  readonly recordedAt: string;
  readonly origin: string;
}

const ORIGIN: Readonly<Record<AdminOrderItemLimitOverride['origin'], string>> = {
  placement: 'à la saisie',
  revision: 'en modification',
};

/**
 * **« Limites de produit dépassées »** sur la fiche d'une commande (plan
 * `plan-passer-outre-la-limite-produit.md`, § 3.5) : le produit, la limite
 * passée, le motif, qui et quand.
 *
 * Rien n'est rendu sans dépassement, ni quand le serveur ne sert pas la liste
 * (sans `lfc_product_limit_override:read`) : il en décide, l'écran se tait.
 *
 * « Qui » est l'identifiant de la fiche d'annuaire : la vue ne porte pas de
 * nom, et l'écran ne sait pas en résoudre un.
 */
@Component({
  selector: 'app-order-item-limit-overrides-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './order-item-limit-overrides-card.html',
})
export class OrderItemLimitOverridesCard {
  readonly overrides = input<readonly AdminOrderItemLimitOverride[] | undefined>(undefined);
  /** Les lignes de la commande, pour nommer le produit plutôt que son SKU. */
  readonly lines = input<readonly OrderLineView[]>([]);

  protected readonly rows = computed<readonly OverrideRow[]>(() => {
    const names = new Map(this.lines().map((line) => [line.sku, line.productName]));
    return (this.overrides() ?? []).map((override) => ({
      product: names.get(override.sku) ?? override.sku,
      limit: `${String(override.daysBefore)} jour${override.daysBefore > 1 ? 's' : ''} avant, ${override.time}`,
      reason: override.reason,
      by: override.staffUserId,
      recordedAt: override.recordedAt,
      origin: ORIGIN[override.origin],
    }));
  });
}
