import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { OrderOpeningExemptionView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { factWhen } from '../../../shared/journal/units';
import { GrantExemptionPanel } from '../grant-exemption-panel/grant-exemption-panel';
import { OrderOpeningExemptionsService } from '../order-opening-exemptions.service';

/**
 * **Les exemptions à la fermeture** (décision de Hugo du 2026-10-26) — sous
 * les interrupteurs de « Ouverture du e-commerce ». La liste est tenue par la
 * page, qui en compte les actives dans son encadré ; la carte ajoute (panneau)
 * et retire (zone de danger), puis demande à la page de relire.
 */
@Component({
  selector: 'app-order-opening-exemptions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './order-opening-exemptions-card.html',
  styleUrl: './order-opening-exemptions-card.scss',
})
export class OrderOpeningExemptionsCard {
  private readonly api = inject(OrderOpeningExemptionsService);
  private readonly notify = inject(NotifyService);
  private readonly panelHost = inject(FoldPanelHostService);

  readonly exemptions = input.required<readonly OrderOpeningExemptionView[]>();
  /** Le droit d'écrire le réglage, `lfc_order_opening:write` : sans lui, la liste se lit. */
  readonly canWrite = input.required<boolean>();
  /** Une exemption est née ou a été retirée : la page relit. */
  readonly changed = output();

  protected readonly pending = signal<string | null>(null);

  protected kindLabel(exemption: OrderOpeningExemptionView): string {
    return exemption.kind === 'company' ? 'Société' : 'Adresse e-mail';
  }

  protected since(exemption: OrderOpeningExemptionView): string {
    const by = exemption.grantedBy === null ? '' : ` par ${exemption.grantedBy}`;
    return `Accordée le ${factWhen(exemption.grantedAt)}${by}`;
  }

  protected add(): void {
    const ref = this.panelHost.open(GrantExemptionPanel);
    void ref.closed.then((granted) => {
      if (granted === true) {
        this.changed.emit();
      }
    });
  }

  protected async withdraw(exemption: OrderOpeningExemptionView): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(exemption.id);
    try {
      await this.api.withdraw(exemption.id);
      this.notify.success(`L’exemption de ${exemption.label} est retirée.`);
      this.changed.emit();
    } catch (error) {
      this.notify.error(error, 'L’exemption n’a pas été retirée.');
    } finally {
      this.pending.set(null);
    }
  }
}
