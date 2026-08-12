import { computed, effect, inject, Injectable, signal } from '@angular/core';

import type { BillingAddressPayload, CartAdjustment, FulfillmentMethod } from '@lfd/contracts';

import { CartService } from '../data/cart.service';
import { computeVatCents } from '../data/vat';
import { AddressesService } from '../entreprises/addresses.service';
import { DeliveryZonesService } from '../entreprises/delivery-zones.service';
import { PickupAddressesService } from '../entreprises/pickup-addresses.service';
import { PlatformSettingsService } from '../entreprises/platform-settings.service';
import { CommerceContextService } from '../commerce/commerce-context.service';
import {
  courierFrom,
  EMPTY_ADDRESS,
  NEW_ADDRESS,
  preferredChoice,
  type CourierAddress,
} from './fulfillment-choice';

export type { CourierAddress } from './fulfillment-choice';

/** Un ajustement de panier : remise (retrait) ou frais (zone coursier). */
export interface FulfillmentAdjustment {
  readonly kind: 'discount' | 'fee';
  readonly label: string;
  readonly cents: number;
}

/**
 * Montant en centimes d'un {@link CartAdjustment} — **miroir local** de
 * `cartAdjustmentCents` de `@lfd/contracts` (gardé **type-only** côté client, sinon
 * zod entre dans le bundle). Le serveur reste l'autorité ; ceci n'est qu'un affichage.
 */
function adjustmentCents(adjustment: CartAdjustment, subtotalCents: number): number {
  if (adjustment.mode === 'amount') {
    return Math.max(0, adjustment.cents);
  }
  return Math.max(0, Math.round((subtotalCents * adjustment.bp) / 10000));
}

/**
 * Choix d'**acheminement** — **partagé** entre le haut du panier (où on choisit) et
 * le checkout (où on confirme). Zéro friction : aucune entreprise requise.
 *
 * - **Coursier** (`delivery`) : on livre soit **une adresse de la société**, soit
 *   une adresse **saisie à la volée**. La **zone** n'est pas un choix : elle se
 *   déduit du code postal livré, et son frais entre dans le total.
 * - **Retrait** (`pickup`) : point de retrait (celui par défaut, ou un autre) ;
 *   sa **remise** s'affiche et sort du total.
 *
 * Le panier **s'ouvre sur la préférence** de la société sélectionnée — un point de
 * départ, jamais une contrainte : le premier geste du client la supplante pour la
 * durée du panier, sans rien réécrire côté serveur.
 *
 * Le total ci-dessous n'est qu'un **affichage** : le serveur le ré-résout à la
 * passation (prix, frais de zone re-déduit du code postal).
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentService {
  private readonly zonesSvc = inject(DeliveryZonesService);
  private readonly pickupsSvc = inject(PickupAddressesService);
  private readonly addressesSvc = inject(AddressesService);
  private readonly settings = inject(PlatformSettingsService);
  private readonly context = inject(CommerceContextService);
  private readonly cart = inject(CartService);

  /** Acheminement choisi. Défaut **retrait** : aucun extra requis (friction nulle). */
  readonly method = signal<FulfillmentMethod>('pickup');
  /** Point de retrait choisi (`''` = défaut serveur). */
  readonly pickupId = signal<string>('');
  /** Adresse livrée choisie : id d'une adresse de la société, ou {@link NEW_ADDRESS}. */
  readonly addressId = signal<string>(NEW_ADDRESS);

  /** L'adresse **saisie à la volée** — vivante même quand une autre est choisie. */
  private readonly draft = signal<CourierAddress>(EMPTY_ADDRESS);

  /**
   * Le client a-t-il touché à l'acheminement de ce panier ? Tant que non, la
   * préférence de sa société s'applique ; après, plus jamais — recaler l'écran
   * sous ses doigts serait pire que de ne rien proposer.
   */
  private readonly touched = signal(false);

  /** Zones connues (route publique) et points de retrait. */
  readonly pickups = this.pickupsSvc.addresses;
  readonly defaultPickup = this.pickupsSvc.defaultPickup;

  /** La livraison est-elle un service ouvert ? Sinon, seul le retrait a un sens. */
  readonly deliveryOffered = computed(() => !this.settings.deliveryHidden());

  /**
   * Les adresses de la société sélectionnée. Réservées aux comptes **actifs** :
   * un dossier en attente n'a pas encore de carnet servi par nos tournées.
   */
  readonly companyAddresses = computed(() => {
    const company = this.context.selected();
    if (company === null || company.status !== 'active') {
      return [];
    }
    return this.addressesSvc.view()?.deliveries ?? [];
  });

  readonly isCourier = computed(() => this.method() === 'delivery');

  /** L'adresse livrée : celle du carnet si une est choisie, la saisie sinon. */
  readonly address = computed<CourierAddress>(() => {
    const chosen = this.companyAddresses().find((address) => address.id === this.addressId());
    return chosen === undefined ? this.draft() : courierFrom(chosen);
  });

  /**
   * La zone de l'adresse livrée. **Déduite**, jamais choisie : un secteur est une
   * propriété du code postal (exact ou par préfixe), pas une option de commande.
   * Le serveur applique la même règle à la passation.
   */
  readonly selectedZone = computed(() =>
    this.zonesSvc.resolveForPostalCode(this.address().codePostal.trim()),
  );

  /** Le point de retrait effectif : celui choisi, sinon le défaut. */
  readonly selectedPickup = computed(
    () => this.pickups().find((point) => point.id === this.pickupId()) ?? this.defaultPickup(),
  );

  /** Sous-total **HT** du panier, en centimes (le panier raisonne en euros). */
  readonly subtotalCents = computed(() => Math.round(this.cart.subtotalHtEur() * 100));

  /** L'ajustement affiché : frais de la zone (coursier) ou remise (retrait), ou `null`. */
  readonly adjustment = computed<FulfillmentAdjustment | null>(() => {
    const subtotal = this.subtotalCents();
    if (this.isCourier()) {
      const zone = this.selectedZone();
      return zone === null
        ? null
        : {
            kind: 'fee',
            label: `Livraison ${zone.label || zone.postalPrefixes[0] || ''}`.trim(),
            cents: adjustmentCents(zone.fee, subtotal),
          };
    }
    const discount = this.selectedPickup()?.discount ?? null;
    return discount === null
      ? null
      : { kind: 'discount', label: 'Remise retrait', cents: adjustmentCents(discount, subtotal) };
  });

  /** Sous-total **HT** net (remise déduite, frais ajoutés), en centimes. */
  readonly netHtCents = computed(() => {
    const subtotal = this.subtotalCents();
    const adjustment = this.adjustment();
    if (adjustment === null) {
      return subtotal;
    }
    return adjustment.kind === 'discount'
      ? Math.max(0, subtotal - adjustment.cents)
      : subtotal + adjustment.cents;
  });

  /**
   * TVA affichée (centimes) — aperçu miroir du serveur : marchandises par taux
   * (remise déduite au prorata) + livraison à 20 %. L'autorité reste le serveur,
   * qui ré-résout le montant à la passation.
   */
  readonly vatCents = computed(() => {
    const adjustment = this.adjustment();
    return computeVatCents({
      lines: this.cart
        .lines()
        .map((line) => ({ htCents: Math.round(line.lineTotalEur * 100), vatRate: line.vatRate })),
      discountCents: adjustment?.kind === 'discount' ? adjustment.cents : 0,
      deliveryFeeCents: adjustment?.kind === 'fee' ? adjustment.cents : 0,
    });
  });

  /** Total **TTC** affiché : `netHT + TVA`, en centimes. C'est le montant encaissé. */
  readonly totalCents = computed(() => this.netHtCents() + this.vatCents());

  /** L'adresse livrée a ses champs requis (rue, code postal, ville). */
  readonly addressValid = computed(() => {
    const address = this.address();
    return (
      address.ligne1.trim() !== '' &&
      address.codePostal.trim() !== '' &&
      address.ville.trim() !== ''
    );
  });

  /**
   * Prêt à commander : en coursier il faut une adresse **complète et desservie**
   * (sans zone, le serveur refuserait la commande — autant le dire avant) ; en
   * retrait, un point de retrait existant.
   */
  readonly ready = computed(() =>
    this.isCourier()
      ? this.addressValid() && this.selectedZone() !== null
      : this.defaultPickup() !== null,
  );

  /**
   * Vrai quand l'adresse est complète mais qu'**aucune zone ne la dessert** —
   * l'unique cas où le panier doit expliquer, plutôt que griser un bouton sans
   * raison visible.
   */
  readonly outOfRange = computed(
    () => this.isCourier() && this.addressValid() && this.selectedZone() === null,
  );

  constructor() {
    // Le carnet de la société sélectionnée, chargé dès qu'elle est active.
    effect(() => {
      const company = this.context.selected();
      if (company !== null && company.status === 'active') {
        this.addressesSvc.loadFor(company.id);
      }
    });

    // La préférence de la société devient la position de départ du panier —
    // tant que le client n'a rien choisi lui-même.
    effect(() => {
      const company = this.context.selected();
      if (company === null || this.touched()) {
        return;
      }
      const choice = preferredChoice(
        company.fulfillmentPreference,
        this.companyAddresses(),
        this.deliveryOffered(),
      );
      if (choice === null) {
        return;
      }
      this.method.set(choice.method);
      this.pickupId.set(choice.pickupId);
      this.addressId.set(choice.addressId);
    });
  }

  setMethod(method: FulfillmentMethod): void {
    this.touched.set(true);
    this.method.set(method);
  }

  setPickup(id: string): void {
    this.touched.set(true);
    this.pickupId.set(id);
  }

  /** Choisit l'adresse livrée : une du carnet, ou {@link NEW_ADDRESS} (saisie). */
  setAddress(id: string): void {
    this.touched.set(true);
    this.addressId.set(id);
  }

  /** Id du point de retrait à envoyer (`null` = laisser le serveur prendre le défaut). */
  pickupAddressId(): string | null {
    if (this.isCourier()) {
      return null;
    }
    return this.pickupId() || null;
  }

  /** Modifie l'adresse **saisie à la volée** (les champs ne s'ouvrent que sur elle). */
  patchAddress(patch: Partial<CourierAddress>): void {
    this.touched.set(true);
    this.draft.update((address) => ({ ...address, ...patch }));
  }

  /** L'adresse livrée figée pour le fil (label/pays par défaut), ou `null` en retrait. */
  deliveryAddressPayload(): BillingAddressPayload | null {
    if (!this.isCourier()) {
      return null;
    }
    const address = this.address();
    return {
      label: '',
      ligne1: address.ligne1.trim(),
      ligne2: address.ligne2.trim(),
      codePostal: address.codePostal.trim(),
      ville: address.ville.trim(),
      pays: 'France',
    };
  }
}
