import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { AdminOrderShortfall, ShortfallAwaitingDecision } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { OrderShortfallDecision } from '../../commandes/order-shortfall-decision/order-shortfall-decision';

/**
 * **Le manque signalé, sur la carte du colisage** (Hugo, 2026-10-25) : chaque
 * ligne manquante dite « Manque : <produit> — <n> sur <dû> au bac », aux
 * quantités figées par le signalement, puis la décision.
 *
 * La décision n'est pas refaite ici : c'est `app-order-shortfall-decision`, le
 * composant de la fiche commande, nourri de la vue du jour. Sans
 * `b2b_orders_shortfall:write`, la carte dit seulement qu'elle attend le
 * commerce.
 */
@Component({
  selector: 'app-packing-shortfall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrderShortfallDecision],
  templateUrl: './packing-shortfall.html',
  styleUrl: './packing-shortfall.scss',
})
export class PackingShortfall {
  readonly shortfall = input.required<ShortfallAwaitingDecision>();
  /** La décision est enregistrée : à la page de relire la journée. */
  readonly decided = output<void>();

  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_orders_shortfall:write'));

  protected readonly missing = computed(() =>
    // Seules les lignes où le bac tient MOINS que le dû : le signalement porte
    // toute la commande, et « 4 sur 4 au bac » n'est pas un manque.
    this.shortfall()
      .lines.filter((line) => line.packed < line.due)
      .map(
        (line) =>
          `Manque : ${line.productName} — ${String(line.packed)} sur ${String(line.due)} au bac`,
      ),
  );

  /** La forme que lit le composant de la fiche : rien n'est décidé, puisqu'on attend. */
  protected readonly asOrderShortfall = computed<AdminOrderShortfall>(() => ({
    reportedAt: this.shortfall().reportedAt,
    lines: this.shortfall().lines.map(({ sku, due, packed }) => ({ sku, due, packed })),
    decision: null,
  }));

  protected readonly names = computed(() =>
    this.shortfall().lines.map((line) => ({ sku: line.sku, productName: line.productName })),
  );
}
