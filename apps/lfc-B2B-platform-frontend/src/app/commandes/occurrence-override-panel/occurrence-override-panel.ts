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
  SubscriptionLineView,
  SubscriptionView,
  UpsertOccurrenceOverridePayload,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { productById } from '../../data/catalogue-seed';
import { formatDayFr } from '@lfd/b2b-ui/subscription';
import { NotifyService } from '../../notify.service';
import { SubscriptionsService } from '../subscriptions.service';

/** Ce que la page passe au panneau : l'abonnement + l'échéance visée. */
export interface OccurrenceOverrideData {
  readonly subscription: SubscriptionView;
  readonly date: string;
}

/** Une ligne éditable de l'échéance (nom résolu + quantité courante). */
interface EditableLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
}

/**
 * Panneau **Modifier cette commande** — déroge à une **échéance précise** d'un
 * panier récurrent : soit on la **saute**, soit on ajuste les **quantités** de ses
 * lignes (0 = retirée). Le reste des échéances suit toujours le gabarit. Ouvert via
 * `open(Cmp, { data: { subscription, date } })`.
 */
@Component({
  selector: 'app-occurrence-override-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './occurrence-override-panel.html',
  styleUrl: './occurrence-override-panel.scss',
})
export class OccurrenceOverridePanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: true, surface: 'solid', side: 'auto' };

  readonly data = input.required<OccurrenceOverrideData>();

  private readonly ref = inject(FoldPanelRef);
  private readonly subscriptions = inject(SubscriptionsService);
  private readonly notify = inject(NotifyService);

  protected readonly modeOptions: readonly FoldViewToggleOption[] = [
    { value: 'order', icon: 'basket', label: 'Commander' },
    { value: 'skip', icon: 'close', label: 'Sauter' },
  ];

  protected readonly skipped = signal(false);
  /** Quantités par SKU (0 = ligne retirée de cette échéance). */
  protected readonly quantities = signal<Record<string, number>>({});
  protected readonly submitting = signal(false);

  /** L'échéance formatée (« 29 août 2026 »). */
  protected readonly dateLabel = computed(() => formatDayFr(this.data().date));

  /** Lignes de base : la dérogation existante si présente, sinon le gabarit. */
  private readonly baseLines = computed<readonly SubscriptionLineView[]>(() => {
    const { subscription, date } = this.data();
    const existing = subscription.overrides.find((override) => override.date === date);
    return existing !== undefined && !existing.skipped ? existing.lines : subscription.lines;
  });

  protected readonly lines = computed<readonly EditableLine[]>(() => {
    const qty = this.quantities();
    return this.baseLines().map((line) => ({
      sku: line.sku,
      name: productById(line.sku)?.name ?? line.sku,
      quantity: qty[line.sku] ?? line.quantity,
    }));
  });

  /** Prêt : sautée, ou au moins une ligne à quantité positive. */
  protected readonly ready = computed(
    () => this.skipped() || this.lines().some((line) => line.quantity > 0),
  );

  constructor() {
    // Pré-remplit une fois depuis la dérogation existante (le cas échéant).
    let prefilled = false;
    effect(() => {
      const { subscription, date } = this.data();
      if (prefilled) {
        return;
      }
      prefilled = true;
      const existing = subscription.overrides.find((override) => override.date === date);
      this.skipped.set(existing?.skipped ?? false);
      const source =
        existing !== undefined && !existing.skipped ? existing.lines : subscription.lines;
      this.quantities.set(Object.fromEntries(source.map((line) => [line.sku, line.quantity])));
    });
  }

  protected onMode(value: string): void {
    this.skipped.set(value === 'skip');
  }

  protected step(sku: string, delta: number): void {
    this.quantities.update((qty) => {
      const current = qty[sku] ?? 0;
      return { ...qty, [sku]: Math.max(0, current + delta) };
    });
  }

  protected submit(): void {
    if (!this.ready() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    const { subscription, date } = this.data();
    const skip = this.skipped();
    const payload: UpsertOccurrenceOverridePayload = {
      skipped: skip,
      lines: skip
        ? []
        : this.lines()
            .filter((line) => line.quantity > 0)
            .map((line) => ({ sku: line.sku, quantity: line.quantity })),
      note: '',
    };
    this.subscriptions.upsertOccurrence(subscription.id, date, payload).subscribe({
      next: () => {
        this.notify.success(skip ? 'Échéance sautée.' : 'Échéance modifiée.');
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
