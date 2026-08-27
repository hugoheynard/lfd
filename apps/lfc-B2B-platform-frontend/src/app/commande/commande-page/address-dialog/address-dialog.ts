import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldIconComponent, FoldInputComponent } from 'fold-ng';

import { ClientDialog } from '../../../client/client-dialog/client-dialog';
import type { ServiceChoice } from '../../../client/client-order.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { MOCK_CLIENT } from '../../../client/mock-client';
import {
  type DeliveryZone,
  type OrderSlot,
  SAVED_ADDRESSES,
  type SavedAddress,
  zoneOf,
} from '../../../client/mock-station';
import { SlotStep } from '../slot-step/slot-step';

/** Le carnet d'abord, la saisie ensuite : `null` quand on saisit. */
type Picked = string | null;

/**
 * « On livre où ? » — le carnet, la saisie, et la ZONE.
 *
 * Le cœur du dialogue est la carte de zone. Les frais de coursier dépendent de
 * la distance à parcourir, jamais du contenu du panier : les montrer AVANT de
 * commander, avec le moyen et le délai qui les expliquent, c'est la différence
 * entre un tarif et une surprise. Le bouton lui-même porte le montant.
 *
 * Le créneau est le SECOND VOLET du même dialogue : où et quand sont deux temps
 * d'une même question, et l'adresse retenue reste sous les yeux.
 */
@Component({
  selector: 'app-address-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldButtonComponent, FoldIconComponent, FoldInputComponent, SlotStep],
  templateUrl: './address-dialog.html',
  styleUrl: './address-dialog.scss',
})
export class AddressDialog {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  /** L'adresse ET l'heure sont prises : il ne reste qu'à composer le panier. */
  readonly done = output<ServiceChoice>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = MOCK_CLIENT;
  protected readonly book = SAVED_ADDRESSES;

  /** 0 : où. 1 : quand. */
  protected readonly step = signal(0);
  protected readonly slot = signal<OrderSlot | null>(null);

  protected readonly picked = signal<Picked>(SAVED_ADDRESSES.find((a) => a.isDefault)?.id ?? null);

  protected readonly street = signal('');
  protected readonly postcode = signal('');
  protected readonly saveToBook = signal(false);

  /** Le tarif d'une adresse du carnet — il s'affiche à côté d'elle. */
  protected fee(address: SavedAddress): string {
    const zone = zoneOf(address.postcode);
    return zone ? `${zone.fee} €` : '—';
  }

  /** La zone en vigueur : celle du carnet quand on y pioche, celle du code saisi sinon. */
  protected readonly zone = computed<DeliveryZone | null>(() => {
    const id = this.picked();
    if (id !== null) {
      const address = SAVED_ADDRESSES.find((a) => a.id === id);
      return address ? zoneOf(address.postcode) : null;
    }
    return zoneOf(this.postcode());
  });

  /** La ville se DÉDUIT du code postal : personne ne la tape deux fois. */
  protected readonly city = computed(() => this.zone()?.city ?? '');

  protected readonly ctaLabel = computed(() => {
    if (this.step() === 1) {
      const c = this.t().slotStep;
      return this.slot() ? c.cta : c.ctaIdle;
    }
    const zone = this.zone();
    const c = this.t().addressDialog;
    return zone ? fill(c.cta, { fee: String(zone.fee) }) : c.ctaBlocked;
  });

  /** Sans zone, il n'y a rien à confirmer — et le bouton le dit. */
  protected readonly ready = computed(() =>
    this.step() === 1 ? this.slot() !== null : this.zone() !== null && this.line() !== '',
  );

  /** L'adresse retenue, que le second volet rappelle. */
  protected readonly line = computed(() => {
    const id = this.picked();
    if (id !== null) {
      const address = SAVED_ADDRESSES.find((a) => a.id === id);
      return address ? `${address.street}, ${address.postcode}` : '';
    }
    const street = this.street().trim();
    return street === '' ? '' : `${street}, ${this.postcode().trim()}`;
  });

  /**
   * Toucher à la saisie, c'est quitter le carnet : les deux répondent à la même
   * question, et une seule peut gagner. Le faire sur le CODE POSTAL autant que
   * sur la rue — sinon changer de code pendant qu'une adresse du carnet est
   * cochée laisse la carte de zone afficher l'ancienne, ce qui est pire que de
   * ne rien afficher.
   */
  protected onStreet(value: string): void {
    this.street.set(value);
    this.leaveBook(value);
  }

  protected onPostcode(value: string): void {
    this.postcode.set(value);
    this.leaveBook(value);
  }

  private leaveBook(value: string): void {
    if (value.trim() !== '') {
      this.picked.set(null);
    }
  }

  protected advance(): void {
    if (!this.ready()) {
      return;
    }
    if (this.step() === 0) {
      this.step.set(1);
      return;
    }
    const zone = this.zone();
    const slot = this.slot();
    if (!zone || !slot) {
      return;
    }
    this.done.emit({
      mode: 'delivery',
      place: this.placeName(),
      at: this.placeAt(),
      address: this.line(),
      // Le coursier ne remise pas : la remise appartient au point de retrait.
      discount: 0,
      fee: zone.fee,
      slot: slot.label,
    });
  }

  /** Le nom de l'adresse : celui du carnet, ou la zone quand on vient de la saisir. */
  private placeName(): string {
    const id = this.picked();
    const address = id === null ? null : SAVED_ADDRESSES.find((a) => a.id === id);
    return address?.label ?? this.zone()?.city ?? '';
  }

  private placeAt(): string {
    const id = this.picked();
    const address = id === null ? null : SAVED_ADDRESSES.find((a) => a.id === id);
    return address?.at ?? 'à cette adresse';
  }

  /** Revenir à l'adresse ne perd pas l'heure : on ne la redemande pas. */
  protected back(): void {
    this.step.set(0);
  }
}
