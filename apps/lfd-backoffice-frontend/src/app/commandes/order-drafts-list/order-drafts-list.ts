import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { OrderDraftSummaryView, PickupAddressView } from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { fulfillmentModeOf } from '../../shared/logistics-colors/fulfillment-mode';
import type { LogisticsCategory } from '../../shared/logistics-colors/logistics-category';
import { LogisticsSwatch } from '../../shared/logistics-colors/logistics-swatch/logistics-swatch';
import { COUNTER_ORDER_ENTRY_LINK } from '../nouvelle-commande/order-entry-origin';
import { orderEntryParams } from '../nouvelle-commande/order-entry-return';
import { OrderDraftsService } from '../order-drafts.service';

type LoadState = 'loading' | 'ready' | 'error';

/** L'heure d'enregistrement, à l'heure de Paris — quel que soit le fuseau du poste. */
const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/** Le plus récent d'abord : c'est l'ordre que le serveur rend. */
const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'savedAt', label: 'Enregistré le', width: '9rem' },
  { key: 'fulfillmentDay', label: 'Pour le', width: '9rem' },
  { key: 'mode', label: 'Mode', width: '12rem' },
  { key: 'companyName', label: 'Client' },
  { key: 'itemCount', label: 'Articles', width: '6rem', align: 'right' },
  { key: 'pretax', label: 'HT estimé', width: '8rem', align: 'right' },
  { key: 'savedByName', label: 'Par', width: '14rem' },
];

const EMPTY: FoldTableEmpty = {
  title: 'Aucun brouillon',
  subtitle: 'Une saisie mise de côté par « Enregistrer le brouillon » se retrouve ici.',
};

/** Où la saisie ramène une fois finie : cet onglet-ci. */
const DRAFTS_ORIGIN = '/commandes?view=drafts';

/**
 * **Les saisies mises de côté**, un brouillon par compte, les plus récents
 * d'abord (décidé par Hugo le 2026-11-21) : on les retrouve depuis la liste
 * des commandes, sans passer par le comptoir ni se souvenir du client.
 *
 * Une ligne rouvre la saisie du compte, qui reprend le brouillon d'elle-même,
 * et y ramène quand elle est finie.
 */
@Component({
  selector: 'app-order-drafts-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    LogisticsSwatch,
  ],
  templateUrl: './order-drafts-list.html',
  styleUrl: './order-drafts-list.scss',
})
export class OrderDraftsList {
  private readonly drafts = inject(OrderDraftsService);
  private readonly router = inject(Router);
  private readonly pickupsService = inject(PickupAddressesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly OrderDraftSummaryView[]>([]);
  /** Les points de retrait, pour nommer celui d'un brouillon. */
  private readonly pickups = signal<readonly PickupAddressView[]>([]);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    // Sans les points, le mode dit « Retrait » sans son nom : la liste reste.
    void this.pickupsService.list().then(
      (pickups) => this.pickups.set(pickups),
      () => this.pickups.set([]),
    );
    try {
      this.rows.set(await this.drafts.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected readonly columns = COLUMNS;
  protected readonly empty = EMPTY;
  protected readonly rowKey = (draft: OrderDraftSummaryView): string => draft.companyId;

  protected date(draft: OrderDraftSummaryView): string {
    return formatOrderDate(draft.savedAt);
  }

  protected time(draft: OrderDraftSummaryView): string {
    return PARIS_TIME.format(new Date(draft.savedAt));
  }

  /** Le jour demandé, et le créneau dessous ; `null` tant qu'il n'est pas choisi. */
  protected day(draft: OrderDraftSummaryView): string | null {
    const day = draft.content?.requestedDeliveryDate ?? null;
    return day === null ? null : formatOrderDate(day);
  }

  protected window(draft: OrderDraftSummaryView): string | null {
    const window = draft.content?.requestedWindow ?? null;
    if (window === null) {
      return null;
    }
    return window.start === null ? `avant ${window.end}` : `${window.start} – ${window.end}`;
  }

  /** Le mode, à la teinte des autres listes ; `null` si le contenu ne se relit plus. */
  protected mode(draft: OrderDraftSummaryView): LogisticsCategory | null {
    const content = draft.content;
    if (content === null) {
      return null;
    }
    const point = this.pickups().find((pickup) => pickup.id === content.pickupAddressId);
    return fulfillmentModeOf(
      { fulfillmentMethod: content.fulfillmentMethod, pickupLabel: point?.label ?? null },
      [],
    );
  }

  /** Le Total HT affiché à l'enregistrement, `null` s'il n'a pas été gardé. */
  protected pretax(draft: OrderDraftSummaryView): string | null {
    const cents = draft.content?.estimatedPretaxCents ?? null;
    return cents === null ? null : formatCents(cents);
  }

  protected resume(draft: OrderDraftSummaryView): void {
    void this.router.navigate([COUNTER_ORDER_ENTRY_LINK, draft.companyId], {
      queryParams: orderEntryParams(DRAFTS_ORIGIN),
    });
  }
}
