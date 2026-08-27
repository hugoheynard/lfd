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
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { MOCK_CLIENT } from '../../../client/mock-client';
import {
  type DeliveryZone,
  SAVED_ADDRESSES,
  type SavedAddress,
  zoneOf,
} from '../../../client/mock-station';

/** Ce qu'on retient du dialogue : où livrer, et à quel prix. */
export interface DeliveryChoice {
  readonly line: string;
  readonly zone: DeliveryZone;
  readonly saveToBook: boolean;
}

/** Le carnet d'abord, la saisie ensuite : `null` quand on saisit. */
type Picked = string | null;

/**
 * « On livre où ? » — le carnet, la saisie, et la ZONE.
 *
 * Le cœur du dialogue est la carte de zone. Les frais de coursier dépendent de
 * la distance à parcourir, jamais du contenu du panier : les montrer AVANT de
 * commander, avec le moyen et le délai qui les expliquent, c'est la différence
 * entre un tarif et une surprise. Le bouton lui-même porte le montant.
 */
@Component({
  selector: 'app-address-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, FoldButtonComponent, FoldIconComponent, FoldInputComponent],
  templateUrl: './address-dialog.html',
  styleUrl: './address-dialog.scss',
})
export class AddressDialog {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  readonly chosen = output<DeliveryChoice>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = MOCK_CLIENT;
  protected readonly book = SAVED_ADDRESSES;

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
    const zone = this.zone();
    const c = this.t().addressDialog;
    return zone ? fill(c.cta, { fee: String(zone.fee) }) : c.ctaBlocked;
  });

  /** Sans zone, il n'y a rien à confirmer — et le bouton le dit. */
  protected readonly ready = computed(() => this.zone() !== null && this.line() !== '');

  private readonly line = computed(() => {
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

  protected confirm(): void {
    const zone = this.zone();
    if (zone && this.ready()) {
      this.chosen.emit({ line: this.line(), zone, saveToBook: this.saveToBook() });
    }
  }
}
