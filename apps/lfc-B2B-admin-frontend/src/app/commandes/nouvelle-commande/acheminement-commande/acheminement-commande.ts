import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldListboxComponent, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';
import { formatAdjustment, resolveZoneForPostalCode } from '@lfd/b2b-ui/order';
import type {
  BillingAddressPayload,
  DeliveryAddressView,
  DeliveryZoneView,
  FulfillmentMethod,
  PickupAddressView,
} from '@lfd/contracts';

/** L'acheminement d'une commande en cours de saisie, tel que le panier l'enverra. */
export interface FulfillmentChoice {
  readonly method: FulfillmentMethod;
  readonly pickupAddressId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Ce qui empêche d'acheminer, en clair — `null` quand tout est en place. */
  readonly issue: string | null;
}

/**
 * **Comment la commande parvient au client** — retrait ou coursier, comme dans le
 * panier du client.
 *
 * L'écran de saisie ne proposait que le retrait, en s'appuyant sur un fait qui
 * n'en est plus un : LFC livre, ses zones se règlent dans Réglages → Livraisons &
 * retraits, et le panier client offre les deux depuis le pivot « zéro friction ».
 * Un back-office qui ne sait pas commander ce que le client sait commander force
 * le commercial à raccrocher.
 *
 * **Les adresses viennent du carnet de la société**, jamais d'une saisie libre :
 * côté client, l'adresse à la volée sert à commander sans compte ; ici le compte
 * existe, et une adresse dictée au téléphone appartient à sa fiche — pas à une
 * commande. Un carnet vide n'est donc pas un obstacle à contourner, c'est une
 * information : il faut passer par la fiche.
 *
 * **La zone n'est pas un choix** : elle se déduit du code postal livré, ici comme
 * au serveur, qui la re-déduira à la passation. L'annoncer avant sert à dire le
 * frais, et à ne pas laisser partir une commande vers un secteur non desservi.
 */
@Component({
  selector: 'app-acheminement-commande',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent, FoldViewToggleComponent],
  templateUrl: './acheminement-commande.html',
  styleUrl: './acheminement-commande.scss',
})
export class AcheminementCommande {
  readonly pickups = input.required<readonly PickupAddressView[]>();
  /** Le carnet de livraison de la société — la défaut en tête. */
  readonly addresses = input.required<readonly DeliveryAddressView[]>();
  readonly zones = input.required<readonly DeliveryZoneView[]>();

  readonly choiceChange = output<FulfillmentChoice>();

  protected readonly method = signal<FulfillmentMethod>('pickup');
  private readonly pickupId = signal('');
  private readonly addressId = signal('');

  protected readonly methods: readonly FoldViewToggleOption[] = [
    { value: 'pickup', icon: 'store', label: 'Retrait' },
    { value: 'delivery', icon: 'truck', label: 'Coursier' },
  ];

  protected readonly isCourier = computed(() => this.method() === 'delivery');

  /** Le point choisi, sinon celui par défaut, sinon le premier — jamais rien si un existe. */
  protected readonly pickup = computed<PickupAddressView | null>(() => {
    const points = this.pickups();
    const chosen = points.find((point) => point.id === this.pickupId());
    return chosen ?? points.find((point) => point.isDefault) ?? points[0] ?? null;
  });

  /** L'adresse choisie, sinon la première du carnet (qui est la défaut). */
  protected readonly address = computed<DeliveryAddressView | null>(() => {
    const book = this.addresses();
    return book.find((entry) => entry.id === this.addressId()) ?? book[0] ?? null;
  });

  protected readonly zone = computed<DeliveryZoneView | null>(() => {
    const address = this.address();
    return address === null ? null : resolveZoneForPostalCode(this.zones(), address.codePostal);
  });

  /** « Secteur Nord — livraison 8,00 € », ou `null` hors coursier. */
  protected readonly zoneLabel = computed<string | null>(() => {
    const zone = this.zone();
    if (zone === null) {
      return null;
    }
    const name = zone.label || zone.postalPrefixes[0] || '';
    return `Secteur ${name} — livraison ${formatAdjustment(zone.fee)}`.trim();
  });

  protected readonly pickupOptions = computed(() =>
    this.pickups().map((point) => ({ value: point.id, label: point.label || point.ville })),
  );

  protected readonly addressOptions = computed(() =>
    this.addresses().map((entry) => ({
      value: entry.id,
      label: `${entry.label || entry.ville} — ${entry.ligne1}, ${entry.codePostal}`,
    })),
  );

  protected readonly choice = computed<FulfillmentChoice>(() => {
    if (!this.isCourier()) {
      const point = this.pickup();
      return {
        method: 'pickup',
        pickupAddressId: point?.id ?? null,
        deliveryAddress: null,
        issue:
          point === null
            ? 'Aucun point de retrait n’est configuré (Réglages → Livraisons & retraits).'
            : null,
      };
    }
    const address = this.address();
    if (address === null) {
      return {
        method: 'delivery',
        pickupAddressId: null,
        deliveryAddress: null,
        issue: 'Ce compte n’a aucune adresse de livraison — ajoutez-la depuis sa fiche.',
      };
    }
    return {
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddress: {
        label: address.label,
        ligne1: address.ligne1,
        ligne2: address.ligne2,
        codePostal: address.codePostal,
        ville: address.ville,
        pays: address.pays,
      },
      issue:
        this.zone() === null
          ? `Aucune tournée ne dessert le ${address.codePostal} — choisissez le retrait.`
          : null,
    };
  });

  constructor() {
    // Le choix vaut dès l'ouverture (retrait au point par défaut) : l'émettre sur
    // les seules interactions aurait laissé le panier sans acheminement tant que
    // le commercial ne touche à rien, c'est-à-dire dans le cas le plus courant.
    effect(() => this.choiceChange.emit(this.choice()));
  }

  protected onMethod(value: string): void {
    this.method.set(value === 'delivery' ? 'delivery' : 'pickup');
  }

  protected onPickup(id: string): void {
    this.pickupId.set(id);
  }

  protected onAddress(id: string): void {
    this.addressId.set(id);
  }
}
