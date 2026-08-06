import { computed, inject, Injectable, signal } from '@angular/core';

import type {
  BillingAddressPayload,
  CartAdjustment,
  DeliveryZoneView,
  FulfillmentMethod,
} from '@lfd/contracts';

import { CartService } from '../data/cart.service';
import { computeVatCents } from '../data/vat';
import { DeliveryZonesService } from '../entreprises/delivery-zones.service';
import { PickupAddressesService } from '../entreprises/pickup-addresses.service';

/** Adresse de livraison libre saisie au panier (coursier). */
export interface CourierAddress {
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
}

/** Un ajustement de panier : remise (retrait) ou frais (zone coursier). */
export interface FulfillmentAdjustment {
  readonly kind: 'discount' | 'fee';
  readonly label: string;
  readonly cents: number;
}

const EMPTY_ADDRESS: CourierAddress = { ligne1: '', ligne2: '', codePostal: '', ville: '' };

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
 * - **Coursier** (`delivery`) : on choisit une **zone** (le frais s'affiche) et on
 *   saisit une **adresse libre**. Le frais entre dans le total.
 * - **Retrait** (`pickup`) : point de retrait par défaut (labo) ; sa **remise**
 *   s'affiche et sort du total.
 *
 * Le total ci-dessous n'est qu'un **affichage** : le serveur le ré-résout à la
 * passation (prix + frais de zone re-résolus depuis leurs `id`).
 */
@Injectable({ providedIn: 'root' })
export class FulfillmentService {
  private readonly zonesSvc = inject(DeliveryZonesService);
  private readonly pickupsSvc = inject(PickupAddressesService);
  private readonly cart = inject(CartService);

  /** Acheminement choisi. Défaut **retrait** : aucun extra requis (friction nulle). */
  readonly method = signal<FulfillmentMethod>('pickup');
  /** Zone de livraison choisie (coursier). */
  readonly zoneId = signal<string>('');
  /** Adresse de livraison libre (coursier). */
  readonly address = signal<CourierAddress>(EMPTY_ADDRESS);

  /** Zones connues (route publique) et point de retrait par défaut. */
  readonly zones = this.zonesSvc.zones;
  readonly defaultPickup = this.pickupsSvc.defaultPickup;

  readonly isCourier = computed(() => this.method() === 'delivery');

  /** La zone sélectionnée (pour son frais), ou `null`. */
  readonly selectedZone = computed(
    () => this.zones().find((zone) => zone.id === this.zoneId()) ?? null,
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
    const discount = this.defaultPickup()?.discount ?? null;
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

  /** L'adresse coursier a ses champs requis (ligne1, code postal, ville). */
  readonly addressValid = computed(() => {
    const address = this.address();
    return (
      address.ligne1.trim() !== '' &&
      address.codePostal.trim() !== '' &&
      address.ville.trim() !== ''
    );
  });

  /** Acheminement prêt à commander : coursier (zone + adresse) ou retrait (point existant). */
  readonly ready = computed(() =>
    this.isCourier()
      ? this.selectedZone() !== null && this.addressValid()
      : this.defaultPickup() !== null,
  );

  setMethod(method: FulfillmentMethod): void {
    this.method.set(method);
  }

  setZone(id: string): void {
    this.zoneId.set(id);
  }

  /** Frais d'une zone au sous-total courant, en centimes (pour l'étiquette de choix). */
  zoneFeeCents(zone: DeliveryZoneView): number {
    return adjustmentCents(zone.fee, this.subtotalCents());
  }

  patchAddress(patch: Partial<CourierAddress>): void {
    this.address.update((address) => ({ ...address, ...patch }));
  }

  /** L'adresse coursier figée pour le fil (label/pays par défaut), ou `null` en retrait. */
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
