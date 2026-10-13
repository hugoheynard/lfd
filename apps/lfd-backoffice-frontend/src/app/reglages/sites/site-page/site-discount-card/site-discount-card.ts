import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { type CartAdjustment, type PickupDiscountAudiences, type SiteView } from '@lfd/contracts';
import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { placePayload } from '../site-place-payload';

/** La réduction telle que l'écran l'édite. */
interface DiscountDraft {
  readonly discount: CartAdjustment | null;
  readonly audiences: PickupDiscountAudiences;
}

function draftOf(site: SiteView): DiscountDraft {
  return { discount: site.discount, audiences: site.discountAudiences };
}

/**
 * **La réduction de retrait d'un site** — une sous-carte de « Paramétrage du
 * retrait », avec SA PROPRE sauvegarde (Hugo, 2026-10-13) : modifier la
 * réduction n'enregistre qu'elle, et son état (modifiée, enregistrée, refusée)
 * se lit dans la sous-carte.
 */
@Component({
  selector: 'app-site-discount-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldPageSectionComponent,
    PriceAlterationField,
  ],
  templateUrl: './site-discount-card.html',
})
export class SiteDiscountCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);
  readonly saved = output();

  protected readonly draft = linkedSignal(() => draftOf(this.site()));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly alteration = computed(() =>
    fromCartAdjustment(this.draft().discount, 'decrease'),
  );
  /** Sans réduction, il n'y a personne à qui l'attribuer. */
  protected readonly audiencesDisabled = computed(() => this.draft().discount === null);
  protected readonly audienceIssue = computed(() => {
    const { discount, audiences } = this.draft();
    return discount !== null && !audiences.b2b && !audiences.b2c
      ? 'Cochez au moins une clientèle, ou retirez la réduction.'
      : '';
  });
  protected readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(draftOf(this.site())),
  );
  protected readonly canSave = computed(
    () => !this.readOnly() && this.dirty() && this.audienceIssue() === '' && !this.saving(),
  );

  protected setDiscount(alteration: PriceAlteration | null): void {
    this.draft.update((d) => ({ ...d, discount: toCartAdjustment(alteration) }));
    this.refusal.set(null);
  }

  protected setAudience(audience: keyof PickupDiscountAudiences, checked: boolean): void {
    this.draft.update((d) => ({ ...d, audiences: { ...d.audiences, [audience]: checked } }));
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.update(
        this.site().id,
        placePayload(this.site(), {
          discount: this.draft().discount,
          discountAudiences: this.draft().audiences,
        }),
      );
      this.notify.success('Réduction de retrait enregistrée.');
      this.saved.emit();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "La réduction de retrait n'a pas pu être enregistrée."),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
