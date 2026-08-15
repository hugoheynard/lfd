import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { FoldListboxComponent, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';
import { formatAdjustment, resolveZoneForPostalCode } from '@lfd/b2b-ui/order';
import { NEW_ADDRESS, type DraftAddress, type DraftStore } from '../draft.store';
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
  /**
   * L'adresse dictée doit-elle rejoindre le carnet du compte ? Vrai seulement
   * pour une **saisie** — une entrée du carnet ne s'y ajoute pas deux fois.
   */
  readonly saveToBook: boolean;
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
 * **Le carnet de la société d'abord, la saisie ensuite** — l'ordre du panier
 * client. Une adresse dictée au téléphone reste une adresse de commande : elle
 * est figée dans le fil, et n'entre pas au carnet, qui se tient depuis la fiche.
 * Le carnet vide ouvre donc directement la saisie plutôt que d'immobiliser
 * l'appel.
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
  /** Le brouillon de l'écran : c'est LUI qui garde le choix, pas ce composant. */
  readonly draft = input.required<DraftStore>();

  readonly choiceChange = output<FulfillmentChoice>();

  protected readonly method = computed(() => this.draft().method());
  protected readonly keepAddress = computed(() => this.draft().keepAddress());

  protected readonly methods: readonly FoldViewToggleOption[] = [
    { value: 'pickup', icon: 'store', label: 'Retrait' },
    { value: 'delivery', icon: 'truck', label: 'Coursier' },
  ];

  protected readonly isCourier = computed(() => this.method() === 'delivery');

  /** Le point choisi, sinon celui par défaut, sinon le premier — jamais rien si un existe. */
  protected readonly pickup = computed<PickupAddressView | null>(() => {
    const points = this.pickups();
    const chosen = points.find((point) => point.id === this.draft().pickupId());
    return chosen ?? points.find((point) => point.isDefault) ?? points[0] ?? null;
  });

  /**
   * L'adresse sélectionnée : celle qu'on a choisie, la première du carnet sinon,
   * et {@link NEW_ADDRESS} quand le carnet est vide — la saisie s'ouvre alors
   * d'elle-même plutôt que d'afficher une liste sans option.
   */
  protected readonly addressId = computed(() => {
    const chosen = this.draft().addressId();
    if (chosen !== '') {
      return chosen;
    }
    return this.addresses()[0]?.id ?? NEW_ADDRESS;
  });

  protected readonly isNewAddress = computed(() => this.addressId() === NEW_ADDRESS);

  /** L'adresse livrée : celle du carnet, ou la saisie. */
  protected readonly address = computed<DraftAddress>(() => {
    const book = this.addresses();
    const chosen = book.find((entry) => entry.id === this.addressId());
    if (chosen === undefined) {
      return this.draft().address();
    }
    return {
      ligne1: chosen.ligne1,
      ligne2: chosen.ligne2,
      codePostal: chosen.codePostal,
      ville: chosen.ville,
    };
  });

  protected readonly zone = computed<DeliveryZoneView | null>(() =>
    resolveZoneForPostalCode(this.zones(), this.address().codePostal.trim()),
  );

  /** « Secteur Nord — livraison 8,00 € », ou `null` quand la zone est inconnue. */
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

  /** Le carnet, puis « une autre adresse » — l'ordre du panier client. */
  protected readonly addressOptions = computed(() => [
    ...this.addresses().map((entry) => ({
      value: entry.id,
      label: `${entry.label || entry.ville} — ${entry.ligne1}, ${entry.codePostal}`,
    })),
    { value: NEW_ADDRESS, label: 'Une autre adresse…' },
  ]);

  /** L'adresse a ses champs requis (rue, code postal, ville). */
  private readonly addressComplete = computed(() => {
    const address = this.address();
    return (
      address.ligne1.trim() !== '' &&
      address.codePostal.trim() !== '' &&
      address.ville.trim() !== ''
    );
  });

  protected readonly choice = computed<FulfillmentChoice>(() =>
    this.isCourier() ? this.courierChoice() : this.pickupChoice(),
  );

  constructor() {
    // Le choix vaut dès l'ouverture (retrait au point par défaut) : l'émettre sur
    // les seules interactions aurait laissé le panier sans acheminement tant que
    // le commercial ne touche à rien, c'est-à-dire dans le cas le plus courant.
    effect(() => this.choiceChange.emit(this.choice()));
  }

  private pickupChoice(): FulfillmentChoice {
    const point = this.pickup();
    return {
      method: 'pickup',
      pickupAddressId: point?.id ?? null,
      deliveryAddress: null,
      saveToBook: false,
      issue:
        point === null
          ? 'Aucun point de retrait n’est configuré (Réglages → Livraisons & retraits).'
          : null,
    };
  }

  private courierChoice(): FulfillmentChoice {
    const address = this.address();
    if (!this.addressComplete()) {
      return {
        method: 'delivery',
        pickupAddressId: null,
        deliveryAddress: null,
        saveToBook: false,
        issue: 'Adresse de livraison incomplète — rue, code postal et ville sont requis.',
      };
    }
    return {
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddress: {
        // Une adresse de commande ne porte pas de nom d'usage : le carnet le tient
        // pour ses propres entrées, la saisie n'en a pas.
        label: '',
        ligne1: address.ligne1.trim(),
        ligne2: address.ligne2.trim(),
        codePostal: address.codePostal.trim(),
        ville: address.ville.trim(),
        pays: 'France',
      },
      // Décochée par défaut, et sans effet sur une entrée du carnet : c'est un
      // geste explicite, pas une conséquence d'avoir tapé une adresse.
      saveToBook: this.isNewAddress() && this.keepAddress(),
      issue:
        this.zone() === null
          ? `Aucune tournée ne dessert le ${address.codePostal.trim()} — choisissez le retrait.`
          : null,
    };
  }

  protected onMethod(value: string): void {
    this.draft().method.set(value === 'delivery' ? 'delivery' : 'pickup');
  }

  protected onPickup(id: string): void {
    this.draft().pickupId.set(id);
  }

  protected onAddress(id: string): void {
    this.draft().addressId.set(id);
  }

  protected onKeep(event: Event): void {
    const element = event.target;
    if (element instanceof HTMLInputElement) {
      this.draft().keepAddress.set(element.checked);
    }
  }

  /** Répercute un champ de la **saisie** (les champs ne s'ouvrent que sur elle). */
  protected onField(field: keyof DraftAddress, event: Event): void {
    const element = event.target;
    if (element instanceof HTMLInputElement) {
      this.draft().patchAddress({ [field]: element.value });
    }
  }
}
