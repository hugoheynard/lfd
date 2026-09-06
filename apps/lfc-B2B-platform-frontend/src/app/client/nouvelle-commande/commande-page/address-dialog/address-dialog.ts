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
import type { DeliveryAddressView, PickupSlot } from '@lfd/contracts';
import { FoldButtonComponent, FoldIconComponent, FoldInputComponent } from 'fold-ng';

import { ClientDialog } from '../../../../client/dialog/client-dialog';
import type { ServiceChoice } from '../../../../client/order-context.store';
import { ClientCopyService, fill } from '../../../../client/copy/client-copy.service';
import { ClientIdentity } from '../../../../client/client-identity.service';
import { addressAt, ClientAddresses } from '../../../../client/client-addresses.service';
import { SlotStep } from '../slot-step/slot-step';
import { formatCents, formatRate } from '../../../../client/format-money';
import { formatWindow } from '../../../../client/format-hour';
import { ServicePoints } from '../../../../client/shop/pickup-points.store';
import { DELIVERY_SLOTS } from './delivery-slots';

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

  /**
   * 🔴 **Le carnet vient de notre base**, plus d'une maquette. Une adresse
   * d'exemple posée à côté d'une commande réelle est une livraison à la mauvaise
   * porte — et un carton déposé chez quelqu'un d'autre ne se corrige pas au
   * téléphone. Vide pour un visiteur anonyme : il saisit, et c'est vrai.
   */
  protected readonly book = inject(ClientAddresses).deliveries;

  /** 0 : où. 1 : quand. */
  protected readonly step = signal(0);
  protected readonly slot = signal<PickupSlot | null>(null);

  /**
   * ⚠️ Les heures de livraison sont **déclarées en dur** : la fenêtre où le
   * coursier passe appartient à la tournée, qui n'existe pas encore. Cf.
   * `delivery-slots.ts`, qui dit ce qu'il est. Le retrait, lui, lit les heures
   * du point.
   */
  protected readonly slots = DELIVERY_SLOTS;

  /**
   * La journée du serveur pour la LIVRAISON — elle ne vise aucun point, donc
   * c'est la règle par défaut de la plateforme qui la décide, heure limite
   * comprise. `null` = aucune journée demandable, et rien ne part.
   */
  private readonly day = computed(() => this.service.nextDayFor(null));

  protected readonly picked = signal<Picked>(null);

  /**
   * Quelqu'un a-t-il touché à la saisie ?
   *
   * Un champ vide ne suffit pas à répondre : effacer une rue après avoir tapé un
   * code postal laisserait les deux champs muets alors que la personne est bien
   * en train de saisir. C'est le GESTE qu'on retient, pas son résultat.
   */
  private touched = false;

  constructor() {
    // L'adresse par défaut se coche quand le carnet ARRIVE, pas avant : le
    // dialogue peut s'ouvrir plus vite que `GET /me` ne répond. Et jamais
    // par-dessus une saisie en cours — ce serait écraser ce qu'on écrit.
    effect(() => {
      const book = this.book();
      if (!this.touched && this.picked() === null && book.length > 0) {
        this.picked.set(book.find((address) => address.isDefault)?.id ?? null);
      }
    });
  }

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
  protected fee(address: DeliveryAddressView): string {
    const zone = this.service.zoneFor(address.codePostal);
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
    return this.book().find((a) => a.id === id)?.codePostal ?? '';
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
      return this.book().find((a) => a.id === id)?.ligne1 ?? '';
    }
    return this.street().trim();
  });

  protected readonly line = computed(() => {
    const id = this.picked();
    if (id !== null) {
      const address = this.book().find((a) => a.id === id);
      return address ? `${address.ligne1}, ${address.codePostal}` : '';
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
    this.touched = true;
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
    const date = this.day();
    if (!zone || !slot || date === null) {
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
      slot: formatWindow(slot.start, slot.end, this.t().slotStep.before),
      // 🔴 La journée vient du SERVEUR. Elle était calculée ici — « demain »,
      // depuis l'horloge du navigateur du client, sans regarder l'heure limite.
      // Cf. `GET /fulfillment-days`.
      date,
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
    return this.pickedAddress()?.label ?? this.zone()?.label ?? '';
  }

  private placeAt(): string {
    const label = this.pickedAddress()?.label;
    return label === undefined ? 'à cette adresse' : addressAt(label);
  }

  /** L'adresse cochée au carnet, ou `null` quand on saisit. */
  private pickedAddress(): DeliveryAddressView | null {
    const id = this.picked();
    return id === null ? null : (this.book().find((address) => address.id === id) ?? null);
  }

  /** Revenir à l'adresse ne perd pas l'heure : on ne la redemande pas. */
  protected back(): void {
    this.step.set(0);
  }
}
