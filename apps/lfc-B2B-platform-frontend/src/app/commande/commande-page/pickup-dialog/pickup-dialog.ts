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
import type { ServiceChoice } from '../../../client/client-order.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { type OrderSlot, PICKUP_POINTS } from '../../../client/mock-station';
import { SlotStep } from '../slot-step/slot-step';

/**
 * « Vous venez où ? » — le choix du point de retrait.
 *
 * La remise n'est pas un argument collé après coup : elle est ATTACHÉE au point,
 * et elle voyage jusque dans le bouton. Choisir Le Village, c'est voir le
 * bouton perdre son « −10 % » — le renoncement se lit avant d'être confirmé.
 *
 * Le créneau est le SECOND VOLET du même dialogue, pas une seconde surface : où
 * et quand sont deux temps d'une même question, et le lieu retenu reste sous les
 * yeux pendant qu'on choisit l'heure.
 */
@Component({
  selector: 'app-pickup-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldButtonComponent, SlotStep],
  templateUrl: './pickup-dialog.html',
  styleUrl: './pickup-dialog.scss',
})
export class PickupDialog {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  /**
   * Le lieu ET l'heure sont pris : il ne reste qu'à composer le panier.
   *
   * Le dialogue REMONTE ce qu'il a fait choisir plutôt que de l'écrire lui-même
   * quelque part : il sait ce qu'il a demandé, pas ce que l'app en fera.
   */
  readonly done = output<ServiceChoice>();

  protected readonly t = inject(ClientCopyService).t;

  /** 0 : où. 1 : quand. */
  protected readonly step = signal(0);
  protected readonly slot = signal<OrderSlot | null>(null);

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

  /** Le lieu retenu, que le second volet rappelle. */
  protected readonly place = computed(() => this.picked()?.name ?? '');

  protected readonly ctaLabel = computed(() => {
    if (this.step() === 1) {
      const c = this.t().slotStep;
      return this.slot() ? c.cta : c.ctaIdle;
    }
    const c = this.t().pickupDialog;
    const point = this.picked();
    return point && point.discount > 0
      ? fill(c.ctaDiscount, { pct: String(point.discount) })
      : c.cta;
  });

  /** À l'étape du créneau, rien à valider tant qu'aucun n'est pris. */
  protected readonly ready = computed(() => this.step() === 0 || this.slot() !== null);

  protected advance(): void {
    if (this.step() === 0) {
      this.step.set(1);
      return;
    }
    const point = this.picked();
    const slot = this.slot();
    if (point && slot) {
      this.done.emit({
        mode: 'pickup',
        place: point.name,
        at: point.at,
        address: point.address,
        discount: point.discount,
        // Le retrait est TOUJOURS gratuit : pas de frais, donc pas de ligne.
        fee: 0,
        slot: slot.label,
      });
    }
  }

  /** Revenir au lieu ne perd pas l'heure déjà choisie : on ne la redemande pas. */
  protected back(): void {
    this.step.set(0);
  }
}
