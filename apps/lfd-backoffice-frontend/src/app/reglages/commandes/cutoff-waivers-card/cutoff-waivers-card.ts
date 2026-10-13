import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OpenOrderCutoffWaiverView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffWaiversService } from '../../../commandes/order-cutoff-waivers.service';
import { NotifyService } from '../../../notify.service';
import { factDay } from '../../../shared/journal/units';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Les dérogations d'heure limite d'actualité** — sous la limite générale de
 * Réglages › Commandes › Heure limite
 * (`documentation/commandes/plan-reglages-commandes.md` §3.2, lot O1c).
 *
 * Une LISTE, pas un geste d'accord : une dérogation s'accorde pendant la
 * saisie d'une commande, là où elle a un motif. Ici, on voit toutes celles dont
 * la journée n'est pas passée, servies ou non, et on retire celle qui n'a pas
 * servi — si l'on tient `b2b_order_waivers:write`, le droit de la route.
 */
@Component({
  selector: 'app-cutoff-waivers-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './cutoff-waivers-card.html',
  styleUrl: './cutoff-waivers-card.scss',
})
export class CutoffWaiversCard {
  private readonly api = inject(OrderCutoffWaiversService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canRevoke = computed(() => this.permissions.can('b2b_order_waivers:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly waivers = signal<readonly OpenOrderCutoffWaiverView[]>([]);
  protected readonly pending = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.waivers.set(await this.api.listOpen());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected day(waiver: OpenOrderCutoffWaiverView): string {
    return factDay(waiver.fulfillmentDate);
  }

  /** L'auteur nommé, ou son identifiant brut : la trace utile quand l'annuaire ne le nomme plus. */
  protected author(waiver: OpenOrderCutoffWaiverView): string {
    return waiver.grantedByName ?? waiver.grantedByStaffId;
  }

  protected async revoke(waiver: OpenOrderCutoffWaiverView): Promise<void> {
    this.pending.set(waiver.id);
    try {
      await this.api.revoke(waiver.id);
      this.notify.success('Dérogation retirée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.pending.set(null);
    }
  }
}
