import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminOrderCancellability, AdminOrderRevisability } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

/**
 * **« Modifier la commande »** depuis son détail staff (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification »).
 * Une action de la bande de tête, visible quel que soit l'onglet.
 *
 * Absent sans `b2b_place_order:write` (le droit des routes de révision).
 * Un lien quand le serveur dit la commande modifiable (`revisability`). Sinon,
 * aucun bouton grisé : la phrase du serveur, en callout — ou en une ligne
 * discrète quand l'annulation est bloquée elle aussi, car c'est alors la seule
 * raison que la bande donne de ce qu'on ne peut plus faire.
 */
@Component({
  selector: 'app-order-revise-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, RouterLink],
  templateUrl: './order-revise-action.html',
  styleUrl: './order-revise-action.scss',
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

  /** Ni modifiable ni annulable : la raison se dit d'une ligne, sans encadré. */
  protected readonly quiet = computed(
    () => this.blocker() !== null && !this.cancellability().cancellable,
  );

  /** Plan A2 : inscrite au plan — le bouton dit qu'on n'y change que les quantités. */
  protected readonly label = computed(() => {
    const r = this.revisability();
    return r.revisable && r.quantitiesOnly !== undefined
      ? 'Modifier les quantités'
      : 'Modifier la commande';
  });

  protected readonly link = computed(() => ['/commandes', this.orderId(), 'modifier']);
}
