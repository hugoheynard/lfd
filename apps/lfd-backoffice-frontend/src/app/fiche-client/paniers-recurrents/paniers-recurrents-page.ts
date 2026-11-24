import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldBadgeVariant,
} from 'fold-ng';
import type {
  AdminRecurringOccurrenceView,
  AdminSubscriptionRow,
  FulfillmentMethod,
  RecurringOccurrenceState,
  SubscriptionLineView,
} from '@lfd/contracts';
import { formatDayFr, RECURRENCE_LABELS } from '@lfd/b2b-ui/subscription';

import { AdminSubscriptionsService } from '../../commandes/admin-subscriptions.service';

type LoadState = 'loading' | 'ready' | 'error';

const FULFILLMENT_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Coursier',
  pickup: 'Retrait',
};

/** L'état d'une échéance, en clair : il est annoncé en texte, jamais par la seule couleur. */
const OCCURRENCE_STATE: Readonly<
  Record<RecurringOccurrenceState, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  planned: { label: 'Prévue', variant: 'info' },
  skipped: { label: 'Sautée', variant: 'neutral' },
  placed: { label: 'Passée', variant: 'success' },
  refused: { label: 'Refusée', variant: 'alert' },
  missed: { label: 'Manquée', variant: 'alert' },
  cancelled: { label: 'Annulée', variant: 'neutral' },
};

/** Les états qui demandent un geste du staff — ceux vers lesquels la cloche pointe. */
const NEEDS_ATTENTION: ReadonlySet<RecurringOccurrenceState> = new Set(['refused', 'missed']);

const SETTLED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **Paniers récurrents** d'un compte, et leurs échéances jour par jour.
 *
 * Un panier appartient à une personne, pas à la société : chaque carte nomme
 * son acheteur. Les échéances refusées ou manquées sont mises en avant avec la
 * phrase du refus — c'est là que le staff agit, ailleurs (la cloche pointe ici).
 *
 * **Lecture seule** : aucun geste staff n'existe sur une échéance.
 */
@Component({
  selector: 'app-client-paniers-recurrents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './paniers-recurrents-page.html',
  styleUrl: './paniers-recurrents-page.scss',
})
export class ClientPaniersRecurrentsPage {
  readonly id = input.required<string>();

  private readonly subscriptions = inject(AdminSubscriptionsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly AdminSubscriptionRow[]>([]);

  protected readonly activeCount = computed(
    () => this.rows().filter((row) => row.status === 'active').length,
  );

  /** Les échéances refusées ou manquées, tous paniers confondus. */
  protected readonly attentionCount = computed(
    () =>
      this.rows()
        .flatMap((row) => row.occurrences)
        .filter((occurrence) => this.needsAttention(occurrence)).length,
  );

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      this.rows.set(await this.subscriptions.listForCompany(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected rhythm(row: AdminSubscriptionRow): string {
    return RECURRENCE_LABELS[row.recurrence];
  }

  protected statusLabel(row: AdminSubscriptionRow): string {
    return row.status === 'active' ? 'Actif' : 'En pause';
  }

  protected fulfillment(row: AdminSubscriptionRow): string {
    return FULFILLMENT_LABELS[row.fulfillmentMethod];
  }

  protected period(row: AdminSubscriptionRow): string {
    return row.endDate === null
      ? `Depuis le ${formatDayFr(row.startDate)}`
      : `Du ${formatDayFr(row.startDate)} au ${formatDayFr(row.endDate)}`;
  }

  /** Le créneau demandé ; un panier ouvert avant qu'on le demande n'en a pas. */
  protected window(row: AdminSubscriptionRow): string {
    const window = row.requestedWindow;
    if (window === null) {
      return 'Aucun créneau demandé';
    }
    return window.start === null ? `Avant ${window.end}` : `De ${window.start} à ${window.end}`;
  }

  protected salesTerms(row: AdminSubscriptionRow): string {
    return `CGV version ${row.salesTerms.revision}`;
  }

  protected nextSalesTerms(row: AdminSubscriptionRow): string | null {
    const next = row.nextSalesTerms;
    return next === null
      ? null
      : `Nouvelles CGV (version ${next.revision}) au ${formatDayFr(next.effectiveOn)}`;
  }

  protected linesLabel(lines: readonly SubscriptionLineView[]): string {
    return lines.length === 0
      ? 'Aucune ligne'
      : lines.map((line) => `${line.quantity} × ${line.sku}`).join(', ');
  }

  protected day(occurrence: AdminRecurringOccurrenceView): string {
    return formatDayFr(occurrence.serviceDay);
  }

  protected stateLabel(occurrence: AdminRecurringOccurrenceView): string {
    return OCCURRENCE_STATE[occurrence.state].label;
  }

  protected stateVariant(occurrence: AdminRecurringOccurrenceView): FoldBadgeVariant {
    return OCCURRENCE_STATE[occurrence.state].variant;
  }

  protected needsAttention(occurrence: AdminRecurringOccurrenceView): boolean {
    return NEEDS_ATTENTION.has(occurrence.state);
  }

  /** L'heure de l'issue, à Paris ; `null` tant qu'il n'y en a pas. */
  protected settledAt(occurrence: AdminRecurringOccurrenceView): string | null {
    return occurrence.settledAt === null ? null : SETTLED_AT.format(new Date(occurrence.settledAt));
  }
}
