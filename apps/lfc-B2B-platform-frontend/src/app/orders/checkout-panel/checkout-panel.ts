import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import type { DeliveryAddressView, PlaceOrderPayload } from '@lfd/contracts';
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
import { OrdersService } from '../orders.service';

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
  protected readonly cart = inject(CartService);

  protected readonly companies = this.account.companies;

  protected readonly companyId = signal('');
  protected readonly addresses = signal<readonly DeliveryAddressView[]>([]);
  protected readonly addressId = signal('');
  protected readonly requestedDate = signal('');
  protected readonly note = signal('');

  /** État de soumission : erreur backend, et numéro de commande une fois passée. */
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly placedNumber = signal<string | null>(null);

  protected readonly selectedCompany = computed<Company | null>(
    () => this.companies().find((company) => company.id === this.companyId()) ?? null,
  );
  protected readonly isActive = computed(() => this.selectedCompany()?.status === 'active');
  protected readonly hasAddress = computed(() => this.addressId() !== '');

  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      !this.cart.isEmpty() &&
      this.isActive() &&
      this.hasAddress() &&
      this.placedNumber() === null,
  );

  constructor() {
    // Une seule entreprise → pré-sélectionnée (pas de choix à faire).
    const only = this.companies();
    if (only.length === 1 && only[0]) {
      this.selectCompany(only[0].id);
    }
  }

  protected fmt(value: number): string {
    return formatEurValue(value);
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
    const payload: PlaceOrderPayload = {
      deliveryAddressId: this.addressId(),
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
