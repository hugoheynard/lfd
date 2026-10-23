import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminOrderCancellability, AdminOrderRevisability } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

/**
 * **« Modifier la commande »** depuis son détail staff (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M3).
 *
 * Absent sans `b2b_place_order:write` (le droit des routes de révision).
 * Ouvert quand le serveur dit la commande modifiable (`revisability`, la
 * règle du geste : au compte à produire, engagée, réglée par carte… —
 * reprise sous verrou au `POST`). Désactivé sinon, avec la phrase du serveur ;
 * elle se tait seulement quand l'annulation est bloquée elle aussi et que son
 * bouton, juste à côté, dit déjà la cause commune.
 */
@Component({
  selector: 'app-order-revise-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './order-revise-action.html',
})
export class OrderReviseAction {
  readonly orderId = input.required<string>();
  readonly revisability = input.required<AdminOrderRevisability>();
  readonly cancellability = input.required<AdminOrderCancellability>();

  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_place_order:write'));

  /** La raison du serveur quand elle ne se modifie plus, sinon `null`. */
  protected readonly blocker = computed(() => {
    const r = this.revisability();
    return r.revisable ? null : r.reason;
  });

  /** La cause n'est pas déjà dite par le bouton d'annulation voisin, bloqué lui aussi. */
  protected readonly saysWhy = computed(() => {
    const cancelSaysIt =
      !this.cancellability().cancellable && this.permissions.can('b2b_cancel_order:write');
    return this.blocker() !== null && !cancelSaysIt;
  });

  protected readonly link = computed(() => ['/commandes', this.orderId(), 'modifier']);
}
