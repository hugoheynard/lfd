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
  CreateSubscriptionPayload,
  FulfillmentMethod,
  OrderView,
  Recurrence,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldListboxComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { RECURRENCE_OPTIONS, todayIso } from '@lfd/b2b-ui/subscription';
import { NotifyService } from '../../notify.service';
import { PickupAddressesService } from '../../entreprises/pickup-addresses.service';
import { SubscriptionsService } from '../subscriptions.service';

/** Un champ d'adresse coursier libre. */
type AddressField = 'ligne1' | 'ligne2' | 'codePostal' | 'ville';

/**
 * Panneau **Transformer en panier récurrent** — un formulaire qui fige, depuis
 * une commande, un gabarit répété : rythme, période (début/fin), acheminement
 * (retrait / coursier + adresse libre), et le rappel du **paiement carte**. Les
 * lignes viennent de la commande d'origine. Ouvert via `open(Cmp, { data: order })`.
 */
@Component({
  selector: 'app-recurring-order-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldListboxComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './recurring-order-panel.html',
  styleUrl: './recurring-order-panel.scss',
})
export class RecurringOrderPanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: true, surface: 'solid', side: 'auto' };

  /** Commande d'origine (ses lignes alimentent le gabarit). */
  readonly data = input.required<OrderView>();

  private readonly ref = inject(FoldPanelRef);
  private readonly subscriptions = inject(SubscriptionsService);
  private readonly notify = inject(NotifyService);
  protected readonly pickups = inject(PickupAddressesService);

  protected readonly recurrenceOptions: readonly FoldViewToggleOption[] = RECURRENCE_OPTIONS.map(
    (option) => ({ value: option.value, label: option.label }),
  );
  protected readonly fulfilOptions: readonly FoldViewToggleOption[] = [
    { value: 'pickup', icon: 'store', label: 'Retrait' },
    { value: 'delivery', icon: 'truck', label: 'Coursier' },
  ];

  protected readonly recurrence = signal<Recurrence>('weekly');
  protected readonly startDate = signal<string>(todayIso());
  protected readonly endDate = signal<string>('');
  protected readonly method = signal<FulfillmentMethod>('pickup');
  protected readonly pickupId = signal<string>('');
  protected readonly address = signal<Record<AddressField, string>>({
    ligne1: '',
    ligne2: '',
    codePostal: '',
    ville: '',
  });
  protected readonly submitting = signal(false);

  protected readonly isCourier = computed(() => this.method() === 'delivery');

  /** Les points de retrait, en options de listbox — libellé identique à l'ancien. */
  protected readonly pickupOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.pickups.addresses().map((point) => ({
      value: point.id,
      label: `${point.label || point.ville} — ${point.ligne1}, ${point.codePostal} ${point.ville}`,
    })),
  );

  /** Formulaire prêt : coursier ⇒ adresse minimale ; retrait ⇒ un point existe. */
  protected readonly ready = computed(() => {
    if (this.startDate() === '') {
      return false;
    }
    if (this.isCourier()) {
      const a = this.address();
      return a.ligne1.trim() !== '' && a.codePostal.trim() !== '' && a.ville.trim() !== '';
    }
    return this.pickups.defaultPickup() !== null;
  });

  constructor() {
    // Pré-remplit une fois depuis la commande (mode + adresse de livraison figée).
    let prefilled = false;
    effect(() => {
      const order = this.data();
      if (prefilled) {
        return;
      }
      prefilled = true;
      this.method.set(order.fulfillmentMethod);
      const a = order.deliveryAddress;
      if (a !== null) {
        this.address.set({
          ligne1: a.ligne1,
          ligne2: a.ligne2,
          codePostal: a.codePostal,
          ville: a.ville,
        });
      }
    });
  }

  protected onRecurrence(value: string): void {
    this.recurrence.set(value === 'monthly' || value === 'biweekly' ? value : 'weekly');
  }

  protected onMethod(value: string): void {
    this.method.set(value === 'delivery' ? 'delivery' : 'pickup');
  }

  protected onDate(which: 'start' | 'end', event: Event): void {
    const el = event.target;
    const value = el instanceof HTMLInputElement ? el.value : '';
    (which === 'start' ? this.startDate : this.endDate).set(value);
  }

  protected onAddress(field: AddressField, event: Event): void {
    const el = event.target;
    if (el instanceof HTMLInputElement) {
      this.address.update((a) => ({ ...a, [field]: el.value }));
    }
  }

  protected submit(): void {
    if (!this.ready() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    const order = this.data();
    const courier = this.isCourier();
    const a = this.address();
    const payload: CreateSubscriptionPayload = {
      fromOrderId: order.id,
      recurrence: this.recurrence(),
      startDate: this.startDate(),
      endDate: this.endDate() === '' ? null : this.endDate(),
      fulfillmentMethod: this.method(),
      deliveryAddress: courier
        ? {
            label: '',
            ligne1: a.ligne1.trim(),
            ligne2: a.ligne2.trim(),
            codePostal: a.codePostal.trim(),
            ville: a.ville.trim(),
            pays: 'France',
          }
        : null,
      pickupAddressId: courier ? null : this.pickupId() || null,
      lines: order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      note: '',
    };
    this.subscriptions.create(payload).subscribe({
      next: () => {
        this.notify.success('Panier récurrent créé.');
        this.ref.close(true);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.notify.error(error);
      },
    });
  }

  protected close(): void {
    this.ref.close();
  }
}
