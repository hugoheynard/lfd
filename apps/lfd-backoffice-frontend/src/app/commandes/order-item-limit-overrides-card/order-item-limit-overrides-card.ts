import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderItemLimitOverride, OrderLineView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

/** Un dépassement, déjà mis en mots. */
interface OverrideRow {
  readonly product: string;
  readonly limit: string;
  readonly reason: string;
  readonly by: string;
  readonly recordedAt: string;
  readonly origin: string;
}

/** Le mot posé en badge sur la ligne de la composition dont la limite a été passée. */
export const LIMIT_OVERRIDE_BADGE = 'hors délai';

/** SKU → « hors délai », pour les lignes de la composition dont la limite a été passée. */
export function limitOverrideBadges(
  overrides: readonly AdminOrderItemLimitOverride[] | undefined,
): ReadonlyMap<string, string> {
  return new Map((overrides ?? []).map((override) => [override.sku, LIMIT_OVERRIDE_BADGE]));
}

const ORIGIN: Readonly<Record<AdminOrderItemLimitOverride['origin'], string>> = {
  placement: 'à la saisie',
  revision: 'en modification',
};

/**
 * **« Limites de produit dépassées »** sur la fiche d'une commande (plan
 * `passer-outre-la-limite-d-un-produit.md`, § 3.5) : le produit, la limite
 * passée, le motif, qui et quand. Un avertissement discret, juste sous le
 * tableau de la composition, dont la ligne porte le badge « hors délai ».
 *
 * Rien n'est rendu sans dépassement, ni quand le serveur ne sert pas la liste
 * (sans `lfc_product_limit_override:read`) : il en décide, l'écran se tait.
 *
 * « Qui » est le nom que le serveur résout ; l'identifiant de la fiche
 * d'annuaire seulement quand il n'en a pas (`staffName: null`).
 */
@Component({
  selector: 'app-order-item-limit-overrides-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldCalloutComponent],
  templateUrl: './order-item-limit-overrides-card.html',
  styleUrl: './order-item-limit-overrides-card.scss',
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
      by: override.staffName ?? override.staffUserId,
      recordedAt: override.recordedAt,
      origin: ORIGIN[override.origin],
    }));
  });
}
