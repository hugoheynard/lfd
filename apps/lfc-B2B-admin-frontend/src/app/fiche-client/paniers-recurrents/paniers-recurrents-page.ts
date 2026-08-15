import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableComponent,
  FoldDataTableCellDirective,
  FoldEmptyStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import type { AdminSubscriptionRow, FulfillmentMethod } from '@lfd/contracts';
import {
  formatDayFr,
  nextOccurrences,
  RECURRENCE_LABELS,
  todayIso,
} from '@lfd/b2b-ui/subscription';

import { AdminSubscriptionsService } from '../../commandes/admin-subscriptions.service';

type LoadState = 'loading' | 'ready' | 'error';

const FULFILLMENT_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Coursier',
  pickup: 'Retrait',
};

/**
 * **Paniers récurrents** d'un compte : ce qui va tomber sans que personne ne
 * recommande.
 *
 * Ils avaient leur place sur cette fiche depuis longtemps — l'onglet Commandes
 * n'en disait que le **nombre**, faute de route staff pour les lire. C'est
 * pourtant la moitié du chiffre d'un client régulier, et la seule à se produire
 * toute seule : ne pas la montrer, c'est ne pas voir venir la production.
 *
 * **Un panier appartient à une personne, pas à la société** — le schéma le dit :
 * `subscriptions.placed_by_user_id`, aucune colonne société. La liste passe donc
 * par les membres, et nomme le porteur de chaque panier ; deux interlocuteurs
 * d'un même compte peuvent en avoir chacun le sien.
 *
 * **Lecture seule.** Suspendre ou reprendre l'abonnement d'un client est une
 * mutation sur son engagement : elle demande sa trace, et de décider ce que le
 * client en voit.
 */
@Component({
  selector: 'app-client-paniers-recurrents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldEmptyStateComponent,
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

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'placedByName', label: 'Porté par' },
    { key: 'recurrence', label: 'Rythme', width: '11rem' },
    { key: 'next', label: 'Prochaine', width: '10rem' },
    { key: 'lines', label: 'Articles', width: '7rem', align: 'right' },
    { key: 'fulfillment', label: 'Acheminement', width: '9rem' },
    { key: 'status', label: 'État', width: '8rem' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucun panier récurrent',
    subtitle: "Ce compte n'a mis en place aucune commande répétée.",
  };

  protected readonly rowKey = (row: AdminSubscriptionRow): string => row.id;

  protected rhythm(row: AdminSubscriptionRow): string {
    return RECURRENCE_LABELS[row.recurrence];
  }

  /**
   * La prochaine échéance, calculée depuis le gabarit — jamais stockée. Un
   * abonnement en pause n'en a pas : afficher une date qui ne se produira pas
   * serait pire que de n'en afficher aucune.
   */
  protected next(row: AdminSubscriptionRow): string {
    if (row.status !== 'active') {
      return '—';
    }
    const [date] = nextOccurrences(row.startDate, row.recurrence, row.endDate, 1, todayIso());
    return date === undefined ? '—' : formatDayFr(date);
  }

  protected fulfillment(row: AdminSubscriptionRow): string {
    return FULFILLMENT_LABELS[row.fulfillmentMethod];
  }

  protected period(row: AdminSubscriptionRow): string {
    return row.endDate === null
      ? `Depuis le ${formatDayFr(row.startDate)}`
      : `Du ${formatDayFr(row.startDate)} au ${formatDayFr(row.endDate)}`;
  }

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
}
