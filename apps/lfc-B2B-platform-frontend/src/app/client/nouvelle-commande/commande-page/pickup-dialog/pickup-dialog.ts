import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientDialog } from '../../../../client/dialog/client-dialog';
import type { ServiceChoice } from '../../../../client/order-context.store';
import { ClientCopyService, fill } from '../../../../client/copy/client-copy.service';
import type { CartAdjustment, PickupAddressView } from '@lfd/contracts';

import { formatCents, formatRate } from '../../../../client/format-money';
import { type OrderSlot } from '../../../../client/mock-station';
import { ServicePoints } from '../../../../client/shop/pickup-points.store';
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

  constructor() {
    void this.service.hydrate();
    // Le défaut se choisit quand la liste arrive, pas avant : le dialogue peut
    // s'ouvrir plus vite que le réseau.
    effect(() => {
      const points = this.available();
      if (this.pickedId() === '' && points.length > 0) {
        this.pickedId.set((points.find((p) => p.isDefault) ?? points[0])?.id ?? '');
      }
    });
  }

  /** 0 : où. 1 : quand. */
  protected readonly step = signal(0);
  protected readonly slot = signal<OrderSlot | null>(null);

  private readonly service = inject(ServicePoints);

  /**
   * Les points **de la plateforme**, plus ceux d'une maquette.
   *
   * Ce qui a disparu avec elle : la distance et l'heure de première fournée. Le
   * serveur ne les connaît pas, et les inventer À CÔTÉ d'une adresse réelle en
   * aurait fait des affirmations fausses plutôt qu'un décor.
   */
  protected readonly available = this.service.pickups;

  /**
   * Le point par défaut est présélectionné — c'est le seul « habituel » qu'une
   * plateforme sache désigner, et il vaut mieux que le premier de la liste.
   */
  protected readonly pickedId = signal<string>('');

  protected readonly points = computed(() => {
    const c = this.t().pickupDialog;
    return this.available().map((point) => ({
      point,
      tag: point.isDefault ? c.habit : '',
      offer:
        point.discount === null
          ? c.shopPrice
          : fill(c.discountTag, { value: valueOf(point.discount) }),
      hasOffer: point.discount !== null,
    }));
  });

  /** La meilleure remise de la station : c'est elle que la phrase d'accueil vend. */
  protected readonly lead = computed(() => {
    const best = bestDiscountOf(this.available());
    return best === null
      ? this.t().pickupDialog.title
      : fill(this.t().pickupDialog.lead, { value: valueOf(best) });
  });

  private readonly picked = computed(
    () => this.available().find((p) => p.id === this.pickedId()) ?? null,
  );

  /** Le lieu retenu, que le second volet rappelle. */
  protected readonly place = computed(() => this.picked()?.label ?? '');

  protected readonly ctaLabel = computed(() => {
    if (this.step() === 1) {
      const c = this.t().slotStep;
      return this.slot() ? c.cta : c.ctaIdle;
    }
    const c = this.t().pickupDialog;
    const discount = this.picked()?.discount ?? null;
    return discount === null ? c.cta : fill(c.ctaDiscount, { value: valueOf(discount) });
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
        place: point.label,
        // Le complément (« au Labo ») n'a **pas** de source serveur : il est
        // dérivé du libellé. Un champ de fil le rendrait juste pour un lieu
        // féminin — c'est une dette de contrat, pas une dette d'écran.
        at: `au ${point.label}`,
        address: `${point.ligne1}, ${point.ville}`,
        // 🔴 L'IDENTITÉ, jamais le montant : la remise est calculée par le
        // serveur, qui est le seul à pouvoir la tenir devant la facture.
        pickupAddressId: point.id,
        slot: slot.label,
      });
    }
  }

  /** Revenir au lieu ne perd pas l'heure déjà choisie : on ne la redemande pas. */
  protected back(): void {
    this.step.set(0);
  }
}

/** Un ajustement, tel qu'il se lit : « 10 % » ou « 2,00 € ». */
function valueOf(adjustment: CartAdjustment): string {
  return adjustment.mode === 'percent'
    ? formatRate(adjustment.bp / 100)
    : formatCents(adjustment.cents);
}

/**
 * La meilleure remise proposée, ou `null`.
 *
 * Comparer un pourcentage à un montant n'a pas de sens sans panier : on retient
 * donc la meilleure de chaque nature, en préférant le pourcentage — c'est ce que
 * la phrase d'accueil vend, et la seule forme qui parle sans connaître le total.
 */
function bestDiscountOf(points: readonly PickupAddressView[]): CartAdjustment | null {
  const offers = points.map((point) => point.discount).filter((d) => d !== null);
  const percents = offers.filter((d) => d.mode === 'percent');
  if (percents.length > 0) {
    return percents.reduce((best, d) => (d.bp > best.bp ? d : best));
  }
  const amounts = offers.filter((d) => d.mode === 'amount');
  return amounts.length === 0
    ? null
    : amounts.reduce((best, d) => (d.cents > best.cents ? d : best));
}
