import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DriverTransferStopView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { TransferLines } from '../transfer-lines/transfer-lines';

/**
 * **Un arrêt de transfert dans « Ma tournée »** (plan du transfert interne,
 * lot T2) : le site, ce qu'on y décharge — totalisé par article —, et le seul
 * geste de l'arrêt, « Remis au site ». Aucun client, aucune adresse de client.
 *
 * Reçu au comptoir avant le passage du livreur, l'arrêt se clôt quand même
 * par « Remis au site » : le serveur ne fait alors que le clore.
 */
@Component({
  selector: 'app-my-round-transfer-stop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
    TransferLines,
  ],
  templateUrl: './my-round-transfer-stop.html',
  styleUrl: './my-round-transfer-stop.scss',
})
export class MyRoundTransferStop {
  readonly stop = input.required<DriverTransferStopView>();
  /** En route, et le droit tenu. */
  readonly gestures = input(false);
  readonly busy = input(false);
  /** `delivery_rounds:read` — le manifeste détaillé (commandes, réapprovisionnement). */
  readonly canReadManifest = input(false);

  readonly dropped = output<DriverTransferStopView>();
  readonly manifest = output<DriverTransferStopView>();

  protected readonly title = computed(() => `→ ${this.stop().siteLabel}`);

  protected readonly subtitle = computed(() => {
    const { orderCount } = this.stop();
    const units = this.stop().totals.reduce((sum, line) => sum + line.quantity, 0);
    return `Transfert · ${orderCount} ${orderCount === 1 ? 'commande' : 'commandes'} · ${units} ${units === 1 ? 'pièce' : 'pièces'}`;
  });

  /** « Remis à 9 h 40 », « Reçu au comptoir à 9 h 12 », ou rien. */
  protected readonly status = computed<string | null>(() => {
    const { closedAt, receivedAt } = this.stop();
    if (closedAt !== null) {
      return `Remis à ${parisTimeOf(closedAt)}`;
    }
    return receivedAt === null ? null : `Reçu au site à ${parisTimeOf(receivedAt)}`;
  });

  protected readonly open = computed(() => this.stop().closedAt === null);
}
