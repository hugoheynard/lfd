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
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';
import { HoursForm, hoursIssueOf, type HoursEntry } from '@lfd/b2b-ui/hours';
import { AddressForm, type PostalAddress } from '@lfd/b2b-ui/address';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
  type PostalDraft,
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
 * postale globale + drapeau « par défaut »).
 *
 * C'est une adresse de **LFC**, pas d'un client : elle n'a pas de société, et
 * c'est ce qui la rend admin-only en écriture — une question d'appartenance,
 * pas de permission. Elle compose donc le fragment postal `lfd-address-form`
 * et y ajoute ce qui n'appartient qu'au vendeur : les heures de retrait, la
 * remise, le point par défaut. (Elle réclamait auparavant le fragment de
 * saisie d'adresse client en se déclarant `kind="billing"` pour dire
 * « postal seulement » — elle mentait sur sa nature pour obtenir ses champs.)
 */
@Component({
  selector: 'app-pickup-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCheckboxComponent,
    AddressForm,
    HoursForm,
    PriceAlterationField,
    FoldPanelBodyComponent,
  ],
  templateUrl: './pickup-panel.html',
  styleUrl: './pickup-panel.scss',
})
export class PickupPanel {
  private readonly pickups = inject(PickupAddressesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<PickupPanelData | undefined>(undefined);

  protected readonly draft = signal<PostalDraft>(EMPTY_POSTAL_DRAFT);
  /** Proposé d'office au checkout. Rang du point, pas champ d'adresse. */
  protected readonly isDefault = signal(false);
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
  /** L'adresse postale, dans la langue neutre du fragment de saisie. */
  protected readonly postal = computed(() => toPostal(this.draft()));

  /** Une adresse postable, et des heures cohérentes. */
  protected readonly canSubmit = computed(
    () => postalIssue(this.draft()) === '' && this.openingIssue() === '',
  );

  constructor() {
    // Préremplit le brouillon à l'ouverture. `data` est fixé et ne change plus.
    effect(() => {
      const address = this.data()?.address ?? null;
      if (address === null) {
        return;
      }
      this.draft.set(postalDraftFrom(address));
      this.isDefault.set(address.isDefault);
      this.discount.set(address.discount);
      this.opening.set(openingEntries(address.opening));
    });
  }

  protected setDiscount(alteration: PriceAlteration | null): void {
    this.discount.set(toCartAdjustment(alteration));
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.saving()) {
      return;
    }
    const address = this.data()?.address ?? null;
    this.saving.set(true);
    const payload: PickupAddressPayload = {
      ...toBillingPayload(this.draft()),
      isDefault: this.isDefault(),
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
