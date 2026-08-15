import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CartAdjustment, PickupAddressPayload, PickupAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';
import { HoursForm, hoursIssueOf, type HoursEntry } from '@lfd/b2b-ui/hours';
import {
  AddressFields,
  billingDraftFrom,
  EMPTY_ADDRESS_DRAFT,
  isAddressValid,
  toBillingPayload,
  type AddressDraft,
} from '@lfd/b2b-ui/company';

import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../../notify.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { EMPTY_OPENING, openingEntries, toPickupOpening } from '../pickup-opening.model';

/** Charge d'ouverture du panneau : le point à éditer, ou `null` pour en créer un. */
export interface PickupPanelData {
  readonly address: PickupAddressView | null;
}

/**
 * Panneau **Point de retrait** — crée ou édite un laboratoire de retrait (adresse
 * postale globale + drapeau « par défaut »). Container **mince** : il seede un
 * brouillon depuis `data`, délègue la saisie postale au fragment partagé
 * `lfd-address-fields` (`kind="facturation"` — sans les consignes de livraison),
 * ajoute la case « par défaut », puis enchaîne la sauvegarde et ferme avec un
 * résultat vrai (la page recharge la liste).
 */
@Component({
  selector: 'app-pickup-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCheckboxComponent,
    AddressFields,
    HoursForm,
    PriceAlterationField,
  ],
  templateUrl: './pickup-panel.html',
  styleUrl: './pickup-panel.scss',
})
export class PickupPanel {
  private readonly pickups = inject(PickupAddressesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<PickupPanelData | undefined>(undefined);

  protected readonly draft = signal<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  /** Remise du point (retirer ici coûte moins cher), ou `null`. */
  protected readonly discount = signal<CartAdjustment | null>(null);
  /** Heures d'ouverture du point — deux fenêtres nommées, jamais fusionnées. */
  protected readonly opening = signal<readonly HoursEntry[]>(openingEntries(EMPTY_OPENING));
  protected readonly saving = signal(false);

  protected readonly openingIssue = computed(() => hoursIssueOf(this.opening()));

  /** Aucune plage renseignée : le point accepte alors n'importe quelle heure. */
  protected readonly noOpening = computed(() =>
    this.opening().every((entry) => entry.range.start === '' && entry.range.end === ''),
  );

  /**
   * La remise vue comme une altération de prix. Le sens est **structurel** —
   * retirer soi-même coûte moins cher, jamais plus — donc il ne se stocke pas.
   */
  protected readonly discountAlteration = computed(() =>
    fromCartAdjustment(this.discount(), 'decrease'),
  );

  protected readonly isCreate = computed(() => (this.data()?.address ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouveau point de retrait' : 'Modifier le point de retrait',
  );
  /** Postal (le fragment n'exige pas les consignes de livraison) + heures cohérentes. */
  protected readonly canSubmit = computed(
    () => isAddressValid(this.draft(), 'facturation') && this.openingIssue() === '',
  );

  constructor() {
    // Préremplit le brouillon à l'ouverture. `data` est fixé et ne change plus.
    effect(() => {
      const address = this.data()?.address ?? null;
      if (address === null) {
        return;
      }
      this.draft.set({ ...billingDraftFrom(address), isDefault: address.isDefault });
      this.discount.set(address.discount);
      this.opening.set(openingEntries(address.opening));
    });
  }

  protected setDiscount(alteration: PriceAlteration | null): void {
    this.discount.set(toCartAdjustment(alteration));
  }

  protected setDefault(isDefault: boolean): void {
    this.draft.update((draft) => ({ ...draft, isDefault }));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.saving()) {
      return;
    }
    const address = this.data()?.address ?? null;
    this.saving.set(true);
    const payload: PickupAddressPayload = {
      ...toBillingPayload(this.draft()),
      isDefault: this.draft().isDefault,
      discount: this.discount(),
      opening: toPickupOpening(this.opening()),
    };
    try {
      if (address === null) {
        await this.pickups.create(payload);
        this.notify.success('Point de retrait ajouté.');
      } else {
        await this.pickups.update(address.id, payload);
        this.notify.success('Point de retrait mis à jour.');
      }
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
