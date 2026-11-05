import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  CartAdjustment,
  CustomerAudience,
  DeliveryPricingPatch,
  DeliveryPricingView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../../../notify.service';
import { DeliveryZonesService } from '../../delivery-zones.service';
import { AUDIENCE_LABELS } from '../delivery-audiences';

/** Le réglage tel qu'il est, et les clientèles ouvertes à la livraison. */
export interface GlobalPricingDialogData {
  readonly pricing: DeliveryPricingView;
  readonly audiences: readonly CustomerAudience[];
}

type Fees = Readonly<Record<CustomerAudience, CartAdjustment | null>>;

function sameFee(a: CartAdjustment | null, b: CartAdjustment | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * **Le réglage global de livraison** (plan `plan-livraison-offerte.md`, 0b) :
 * le frais de base de chaque clientèle ouverte, dont chaque zone hérite sauf
 * si elle le remplace. Vide = « rien de réglé » : chaque zone garde alors son
 * ancien frais. Le franco est posé côté serveur mais ne s'applique qu'au lot
 * 1 : ce dialogue ne le montre pas.
 *
 * Seules les clientèles OUVERTES sont envoyées : une clientèle masquée garde
 * ses valeurs (le patch ne touche que ce qu'il dit).
 */
@Component({
  selector: 'app-global-pricing-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    PriceAlterationField,
  ],
  templateUrl: './global-pricing-dialog.html',
  styleUrl: './global-pricing-dialog.scss',
})
export class GlobalPricingDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  private readonly zones = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<GlobalPricingDialogData | undefined>(undefined);

  protected readonly labels = AUDIENCE_LABELS;
  protected readonly audiences = computed(() => this.data()?.audiences ?? []);
  protected readonly fees = signal<Fees>({ b2b: null, b2c: null });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly initial = computed<Fees>(() => {
    const pricing = this.data()?.pricing;
    return { b2b: pricing?.b2b.fee ?? null, b2c: pricing?.b2c.fee ?? null };
  });

  /** Enregistrer n'est cliquable que si une clientèle ouverte a changé. */
  protected readonly dirty = computed(() =>
    this.audiences().some((audience) => !sameFee(this.fees()[audience], this.initial()[audience])),
  );

  constructor() {
    effect(() => this.fees.set(this.initial()));
  }

  protected alteration(audience: CustomerAudience): PriceAlteration | null {
    return fromCartAdjustment(this.fees()[audience], 'increase');
  }

  protected setFee(audience: CustomerAudience, alteration: PriceAlteration | null): void {
    this.fees.update((fees) => ({ ...fees, [audience]: toCartAdjustment(alteration) }));
  }

  /** « Revenir à l'ancien frais des zones » : rien de réglé pour cette clientèle. */
  protected clear(audience: CustomerAudience): void {
    this.fees.update((fees) => ({ ...fees, [audience]: null }));
  }

  protected async submit(): Promise<void> {
    if (!this.dirty() || this.saving()) {
      return;
    }
    const patch: DeliveryPricingPatch = Object.fromEntries(
      this.audiences().map((audience) => [audience, { fee: this.fees()[audience] }]),
    );
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.zones.updatePricing(patch);
      this.notify.success('Réglage de livraison enregistré.');
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "Le réglage de livraison n'a pas pu être enregistré."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
