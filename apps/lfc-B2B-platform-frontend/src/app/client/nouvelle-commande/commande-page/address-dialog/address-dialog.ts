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

import { ClientDialog } from '../../../../client/dialog/client-dialog';
import type { ServiceChoice } from '../../../../client/order-context.store';
import { ClientCopyService, fill } from '../../../../client/copy/client-copy.service';
import { ClientIdentity } from '../../../../client/client-identity.service';
import {
  type OrderSlot,
  SAVED_ADDRESSES,
  type SavedAddress,
  slotDate,
} from '../../../../client/mock-station';
import { SlotStep } from '../slot-step/slot-step';
import { formatCents, formatRate } from '../../../../client/format-money';
import { ServicePoints } from '../../../../client/shop/pickup-points.store';

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
  /** Prérempli depuis le COMPTE : c'est là que vivent le nom et le numéro. */
  protected readonly client = inject(ClientIdentity);
  private readonly service = inject(ServicePoints);
  protected readonly book = SAVED_ADDRESSES;

  /** 0 : où. 1 : quand. */
  protected readonly step = signal(0);
  protected readonly slot = signal<OrderSlot | null>(null);

  protected readonly picked = signal<Picked>(SAVED_ADDRESSES.find((a) => a.isDefault)?.id ?? null);

  protected readonly street = signal('');
  protected readonly postcode = signal('');
  protected readonly saveToBook = signal(false);

  /**
   * Le tarif d'une adresse du carnet — il s'affiche à côté d'elle.
   *
   * Il vient de la zone **en base**, plus d'un nombre écrit dans une maquette :
   * les frais peuvent être un pourcentage du panier, et cet écran ne le saurait
   * pas. Il affiche alors la forme, pas un montant qu'il aurait inventé.
   */
  protected fee(address: SavedAddress): string {
    const zone = this.service.zoneFor(address.postcode);
    if (zone === null) {
      return '—';
    }
    return zone.fee.mode === 'amount' ? formatCents(zone.fee.cents) : formatRate(zone.fee.bp / 100);
  }

  /** La zone en vigueur : celle du carnet quand on y pioche, celle du code saisi sinon. */
  protected readonly zone = computed(() => this.service.zoneFor(this.codePostal()));

  /** Le tarif de la zone retenue, dans sa forme — montant ou pourcentage. */
  protected readonly zoneFee = computed(() => {
    const fee = this.zone()?.fee ?? null;
    if (fee === null) {
      return '';
    }
    return fee.mode === 'amount' ? formatCents(fee.cents) : formatRate(fee.bp / 100);
  });

  /** Le code postal en vigueur : celui du carnet quand on y pioche, celui saisi sinon. */
  private readonly codePostal = computed(() => {
    const id = this.picked();
    if (id === null) {
      return this.postcode();
    }
    return SAVED_ADDRESSES.find((a) => a.id === id)?.postcode ?? '';
  });

  /**
   * Le libellé de la zone tient lieu de ville.
   *
   * La maquette portait une ville par zone ; `DeliveryZoneView` n'en a pas — une
   * zone est un ensemble de préfixes, pas une commune. Afficher son libellé dit
   * la même chose sans rien inventer.
   */
  protected readonly city = computed(() => this.zone()?.label ?? '');

  protected readonly ctaLabel = computed(() => {
    if (this.step() === 1) {
      const c = this.t().slotStep;
      return this.slot() ? c.cta : c.ctaIdle;
    }
    const zone = this.zone();
    const c = this.t().addressDialog;
    return zone
      ? fill(c.cta, {
          fee:
            zone.fee.mode === 'amount'
              ? formatCents(zone.fee.cents)
              : formatRate(zone.fee.bp / 100),
        })
      : c.ctaBlocked;
  });

  /** Sans zone, il n'y a rien à confirmer — et le bouton le dit. */
  protected readonly ready = computed(() =>
    this.step() === 1 ? this.slot() !== null : this.zone() !== null && this.line() !== '',
  );

  /** L'adresse retenue, que le second volet rappelle. */
  /**
   * La rue SEULE — ce que `ligne1` attend.
   *
   * Distincte de {@link line}, qui colle le code postal derrière pour
   * l'affichage. Les envoyer ensemble mettrait « 5 rue du Four, 75002 » dans un
   * champ qui a déjà sa colonne `codePostal`, et le bon de livraison le
   * répéterait deux fois.
   */
  protected readonly streetLine = computed(() => {
    const id = this.picked();
    if (id !== null) {
      return SAVED_ADDRESSES.find((a) => a.id === id)?.street ?? '';
    }
    return this.street().trim();
  });

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
      // 🔴 Le CODE POSTAL, jamais le tarif : la zone s'en déduit côté serveur,
      // qui applique alors le même barème que la facture. Le front portait le
      // montant, en euros flottants, et ne savait pas dire des frais au
      // pourcentage.
      codePostal: this.codePostal(),
      slot: slot.label,
      date: slotDate(),
      // 🔴 L'adresse COMPLÈTE, en plus du code postal. Le code postal chiffre
      // (la zone s'en déduit) ; il ne livre pas. `POST /orders` refuse une
      // livraison sans adresse, et il a raison.
      //
      // La ville vient du LIBELLÉ DE ZONE, faute de mieux : `DeliveryZoneView`
      // n'en porte pas, et la maquette en portait une par zone. C'est la même
      // approximation que l'écran affiche déjà — cf. `city` ci-dessus.
      deliveryAddress: {
        label: this.placeName(),
        ligne1: this.streetLine(),
        ligne2: '',
        codePostal: this.codePostal(),
        ville: this.city(),
        pays: 'France',
      },
    });
  }

  /** Le nom de l'adresse : celui du carnet, ou la zone quand on vient de la saisir. */
  private placeName(): string {
    const id = this.picked();
    const address = id === null ? null : SAVED_ADDRESSES.find((a) => a.id === id);
    return address?.label ?? this.zone()?.label ?? '';
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
