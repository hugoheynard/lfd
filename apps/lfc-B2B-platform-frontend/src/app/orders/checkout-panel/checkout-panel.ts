import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type {
  CartAdjustment,
  DeliveryAddressView,
  FulfillmentMethod,
  PlaceOrderPayload,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import type { Company } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import { formatEurValue } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { DeliveryZonesService } from '../../entreprises/delivery-zones.service';
import { PickupAddressesService } from '../../entreprises/pickup-addresses.service';
import { PlatformSettingsService } from '../../entreprises/platform-settings.service';
import { OrdersService } from '../orders.service';

/** Un ajustement de panier affiché au checkout : remise (retrait) ou frais (zone). */
interface CheckoutAdjustment {
  readonly kind: 'discount' | 'fee';
  readonly label: string;
  readonly cents: number;
}

/**
 * Montant en centimes d'un {@link CartAdjustment} sur un sous-total — **miroir
 * local** de `cartAdjustmentCents` de `@lfd/contracts`, réimplémenté ici pour
 * garder le contrat **type-only** côté client (importer la fonction tirerait zod
 * dans le bundle). Le serveur reste l'autorité ; ceci n'est qu'un affichage.
 */
function adjustmentCents(adjustment: CartAdjustment, subtotalCents: number): number {
  if (adjustment.mode === 'amount') {
    return Math.max(0, adjustment.cents);
  }
  return Math.max(0, Math.round((subtotalCents * adjustment.bp) / 10000));
}

/**
 * Panneau **Checkout** — dernière étape du panier : choisir l'entreprise
 * cliente et son adresse de livraison, une date souhaitée et une note, puis
 * passer commande.
 *
 * On n'envoie que `sku` + quantité : le serveur ré-résout les prix et **gate**
 * sur l'activation de l'entreprise (règlement + KBIS validés). Une entreprise non
 * activée reste sélectionnable pour préparer, mais le bouton explique le refus.
 */
@Component({
  selector: 'app-checkout-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldSelectComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './checkout-panel.html',
  styleUrl: './checkout-panel.scss',
})
export class CheckoutPanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: false, surface: 'solid' };

  private readonly ref = inject(FoldPanelRef);
  private readonly account = inject(AccountService);
  private readonly orders = inject(OrdersService);
  private readonly settings = inject(PlatformSettingsService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly zones = inject(DeliveryZonesService);
  protected readonly cart = inject(CartService);

  /** Ouverture depuis une page qui sait déjà quel établissement viser. */
  readonly data = input<{ readonly companyId?: string } | undefined>(undefined);

  protected readonly companies = this.account.companies;

  protected readonly companyId = signal('');
  protected readonly addresses = signal<readonly DeliveryAddressView[]>([]);
  protected readonly addressId = signal('');
  protected readonly requestedDate = signal('');
  protected readonly note = signal('');

  /** Acheminement choisi. Défaut livraison ; forcé au retrait si la livraison
   * n'existe pas encore (config globale). */
  protected readonly fulfillment = signal<FulfillmentMethod>('delivery');
  /** La livraison est-elle masquée (service absent) ? Verrouille le choix. */
  protected readonly deliveryHidden = this.settings.deliveryHidden;
  /** Le point de retrait par défaut (labo), présélectionné, affiché en lecture seule. */
  protected readonly defaultPickup = this.pickups.defaultPickup;
  protected readonly isPickup = computed(() => this.fulfillment() === 'pickup');

  /** Sous-total du panier, en centimes (le panier raisonne en euros). */
  protected readonly subtotalCents = computed(() => Math.round(this.cart.totalEur() * 100));

  /** L'adresse de livraison sélectionnée (pour retrouver sa zone), ou `null`. */
  private readonly selectedAddress = computed<DeliveryAddressView | null>(
    () => this.addresses().find((address) => address.id === this.addressId()) ?? null,
  );

  /**
   * L'ajustement affiché : la **remise** du point de retrait (retrait), ou le
   * **frais** de la zone du code postal livré (livraison), ou `null`. Miroir du
   * calcul serveur (qui reste l'autorité) — juste pour montrer le prix.
   */
  protected readonly adjustment = computed<CheckoutAdjustment | null>(() => {
    const subtotal = this.subtotalCents();
    if (this.isPickup()) {
      const discount = this.defaultPickup()?.discount ?? null;
      return discount === null
        ? null
        : { kind: 'discount', label: 'Remise retrait', cents: adjustmentCents(discount, subtotal) };
    }
    const address = this.selectedAddress();
    const zone = address === null ? null : this.zones.resolveForPostalCode(address.codePostal);
    return zone === null
      ? null
      : {
          kind: 'fee',
          label: `Livraison ${zone.label || zone.postalPrefixes[0] || ''}`,
          cents: adjustmentCents(zone.fee, subtotal),
        };
  });

  /** Total affiché : `max(0, sous-total − remise) + frais`, en centimes. */
  protected readonly totalCents = computed(() => {
    const subtotal = this.subtotalCents();
    const adjustment = this.adjustment();
    if (adjustment === null) {
      return subtotal;
    }
    return adjustment.kind === 'discount'
      ? Math.max(0, subtotal - adjustment.cents)
      : subtotal + adjustment.cents;
  });

  /** État de soumission : erreur backend, et numéro de commande une fois passée. */
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly placedNumber = signal<string | null>(null);

  protected readonly selectedCompany = computed<Company | null>(
    () => this.companies().find((company) => company.id === this.companyId()) ?? null,
  );
  protected readonly isActive = computed(() => this.selectedCompany()?.status === 'active');

  /** Acheminement prêt : en retrait, un point par défaut existe ; en livraison,
   * une adresse est choisie. */
  protected readonly fulfillmentReady = computed(() =>
    this.isPickup() ? this.defaultPickup() !== null : this.addressId() !== '',
  );

  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      !this.cart.isEmpty() &&
      this.isActive() &&
      this.fulfillmentReady() &&
      this.placedNumber() === null,
  );

  constructor() {
    // Une seule entreprise → pré-sélectionnée (pas de choix à faire).
    const only = this.companies();
    if (only.length === 1 && only[0]) {
      this.selectCompany(only[0].id);
    }

    // Établissement pré-choisi par la page appelante (contexte commerce).
    effect(() => {
      const preselect = this.data()?.companyId;
      if (preselect !== undefined && preselect !== '' && this.companyId() === '') {
        this.selectCompany(preselect);
      }
    });

    // Livraison masquée (service absent) → le retrait est le seul acheminement.
    effect(() => {
      if (this.deliveryHidden()) {
        this.fulfillment.set('pickup');
      }
    });
  }

  /** Change l'acheminement (verrouillé sur retrait si la livraison est masquée). */
  protected setFulfillment(method: FulfillmentMethod): void {
    if (this.deliveryHidden()) {
      return;
    }
    this.fulfillment.set(method);
  }

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  /** Formate un montant en **centimes** (les ajustements raisonnent en centimes). */
  protected fmtCents(cents: number): string {
    return formatEurValue(cents / 100);
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  /** Libellé d'une adresse pour l'option du select. */
  protected addressLabel(address: DeliveryAddressView): string {
    const name = address.label === '' ? address.ville : address.label;
    return `${name} — ${address.ligne1}, ${address.codePostal} ${address.ville}`;
  }

  /** Choisit l'entreprise et (re)charge ses adresses de livraison. */
  protected selectCompany(id: string): void {
    this.companyId.set(id);
    this.addresses.set([]);
    this.addressId.set('');
    this.errorMessage.set(null);
    if (id === '') {
      return;
    }
    this.orders.deliveryAddresses(id).subscribe({
      next: (view) => {
        this.addresses.set(view.deliveries);
        // La défaut est renvoyée en tête par le backend.
        this.addressId.set(view.deliveries[0]?.id ?? '');
      },
      error: () => this.addresses.set([]),
    });
  }

  protected placeOrder(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const pickup = this.isPickup();
    const payload: PlaceOrderPayload = {
      fulfillmentMethod: this.fulfillment(),
      // En retrait, on laisse le serveur résoudre le point par défaut (labo).
      deliveryAddressId: pickup ? null : this.addressId(),
      pickupAddressId: null,
      requestedDeliveryDate: this.requestedDate() === '' ? null : this.requestedDate(),
      note: this.note().trim(),
      lines: this.cart.lines().map((line) => ({ sku: line.product.id, quantity: line.qty })),
    };
    this.orders.placeOrder(this.companyId(), payload).subscribe({
      next: (placed) => {
        this.placedNumber.set(placed.orderNumber);
        this.cart.clear();
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(readError(error));
      },
    });
  }

  protected done(): void {
    this.ref.close(true);
  }

  protected close(): void {
    this.ref.close();
  }
}

/** Message backend s'il est lisible (erreur métier rédigée), sinon générique. */
function readError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = (error as { error: unknown }).error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message !== '') {
        return message;
      }
    }
  }
  return 'La commande a échoué. Réessayez.';
}
