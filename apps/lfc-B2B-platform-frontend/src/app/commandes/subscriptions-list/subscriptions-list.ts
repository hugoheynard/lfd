import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { FulfillmentMethod, SubscriptionView } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { productById } from '../../data/catalogue-seed';
import {
  formatDayFr,
  nextDayIso,
  nextOccurrences,
  RECURRENCE_LABELS,
  todayIso,
} from '../../data/recurrence';

const FULFILLMENT_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Coursier',
  pickup: 'Retrait',
};

/** Combien d'échéances à venir on montre en aperçu. */
const PREVIEW_COUNT = 2;

/** État d'une échéance vis-à-vis du gabarit. */
type OccurrenceState = 'default' | 'modified' | 'skipped';

/** Une échéance à venir, prête à afficher. */
interface OccurrenceRow {
  readonly date: string;
  readonly label: string;
  /** Retrait/livraison = commande + 1 jour (« 29 août 2026 »). */
  readonly fulfilLabel: string;
  readonly state: OccurrenceState;
}

/** Verbe d'acheminement pour la ligne d'échéance. */
const FULFILLMENT_VERBS: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Livraison',
  pickup: 'Retrait',
};

/** Un abonnement mis en forme pour la carte (résumé + prochaines échéances). */
interface SubscriptionCard {
  readonly sub: SubscriptionView;
  readonly rhythm: string;
  readonly period: string;
  readonly fulfillment: string;
  readonly fulfilVerb: string;
  readonly items: string;
  readonly next: readonly OccurrenceRow[];
}

/**
 * Liste des **paniers récurrents** — présentationnel : la page possède l'état,
 * on ne fait que mettre en forme. Sous chaque abonnement, un aperçu des
 * **prochaines commandes** (échéances calculées), chacune avec un bouton pour
 * modifier **cette occurrence uniquement** (émis à la page).
 */
@Component({
  selector: 'app-subscriptions-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './subscriptions-list.html',
  styleUrl: './subscriptions-list.scss',
})
export class SubscriptionsList {
  readonly subscriptions = input.required<readonly SubscriptionView[]>();

  /** Demande de modifier une occurrence précise. */
  readonly editOccurrence = output<{ readonly subscriptionId: string; readonly date: string }>();

  /** Bascule pause/reprise d'un abonnement (la page appelle le service). */
  readonly toggleStatus = output<SubscriptionView>();

  /** Suppression confirmée d'un abonnement (id). */
  readonly remove = output<string>();

  /** Id de l'abonnement en attente de confirmation de suppression (inline). */
  protected readonly confirmingId = signal<string | null>(null);

  protected askDelete(id: string): void {
    this.confirmingId.set(id);
  }

  protected cancelDelete(): void {
    this.confirmingId.set(null);
  }

  protected confirmDelete(id: string): void {
    this.confirmingId.set(null);
    this.remove.emit(id);
  }

  protected readonly cards = computed<readonly SubscriptionCard[]>(() => {
    const today = todayIso();
    return this.subscriptions().map((sub) => ({
      sub,
      rhythm: RECURRENCE_LABELS[sub.recurrence],
      period:
        sub.endDate === null
          ? `À partir du ${formatDayFr(sub.startDate)}`
          : `Du ${formatDayFr(sub.startDate)} au ${formatDayFr(sub.endDate)}`,
      fulfillment: FULFILLMENT_LABELS[sub.fulfillmentMethod],
      fulfilVerb: FULFILLMENT_VERBS[sub.fulfillmentMethod],
      items: itemsSummary(sub),
      next: nextOccurrences(sub.startDate, sub.recurrence, sub.endDate, PREVIEW_COUNT, today).map(
        (date) => ({
          date,
          label: formatDayFr(date),
          fulfilLabel: formatDayFr(nextDayIso(date)),
          state: occurrenceState(sub, date),
        }),
      ),
    }));
  });
}

/** État d'une échéance : sautée / modifiée (dérogation) ou suivant le gabarit. */
function occurrenceState(sub: SubscriptionView, date: string): OccurrenceState {
  const override = sub.overrides.find((entry) => entry.date === date);
  if (override === undefined) {
    return 'default';
  }
  return override.skipped ? 'skipped' : 'modified';
}

/** Résumé lisible des lignes : « 3 × Croissant · 2 × Baguette ». */
function itemsSummary(sub: SubscriptionView): string {
  return sub.lines
    .map((line) => `${line.quantity} × ${productById(line.sku)?.name ?? line.sku}`)
    .join(' · ');
}
