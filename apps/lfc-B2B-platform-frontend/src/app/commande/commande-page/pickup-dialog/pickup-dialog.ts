import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientDialog } from '../../../client/client-dialog/client-dialog';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { PICKUP_POINTS, type PickupPoint } from '../../../client/mock-station';

/**
 * « Vous venez où ? » — le choix du point de retrait.
 *
 * La remise n'est pas un argument collé après coup : elle est ATTACHÉE au point,
 * et elle voyage jusque dans le bouton. Choisir Le Village, c'est voir le
 * bouton perdre son « −10 % » — le renoncement se lit avant d'être confirmé.
 */
@Component({
  selector: 'app-pickup-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldButtonComponent],
  templateUrl: './pickup-dialog.html',
  styleUrl: './pickup-dialog.scss',
})
export class PickupDialog {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  /** Le point retenu — la suite du parcours en dépend. */
  readonly chosen = output<PickupPoint>();

  protected readonly t = inject(ClientCopyService).t;

  /** L'habitude est présélectionnée : c'est le choix qu'on refait le plus. */
  protected readonly pickedId = signal(PICKUP_POINTS.find((p) => p.habitual)?.id ?? '');

  protected readonly points = computed(() => {
    const c = this.t().pickupDialog;
    return PICKUP_POINTS.map((point) => ({
      point,
      tag: point.habitual ? c.habit : (point.distance ?? ''),
      ready: fill(c.readyFrom, { time: point.readyFrom }),
      offer:
        point.discount > 0 ? fill(c.discountTag, { pct: String(point.discount) }) : c.shopPrice,
    }));
  });

  /** La meilleure remise de la station : c'est elle que la phrase d'accueil vend. */
  protected readonly lead = computed(() =>
    fill(this.t().pickupDialog.lead, {
      pct: String(Math.max(...PICKUP_POINTS.map((p) => p.discount))),
    }),
  );

  private readonly picked = computed(
    () => PICKUP_POINTS.find((p) => p.id === this.pickedId()) ?? null,
  );

  protected readonly ctaLabel = computed(() => {
    const c = this.t().pickupDialog;
    const point = this.picked();
    return point && point.discount > 0
      ? fill(c.ctaDiscount, { pct: String(point.discount) })
      : c.cta;
  });

  protected confirm(): void {
    const point = this.picked();
    if (point) {
      this.chosen.emit(point);
    }
  }
}
