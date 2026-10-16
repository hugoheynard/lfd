import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { CommerceOperationView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { formatInstant, pickupPhrase } from '../../pim/operations/operation-schedule';
import {
  audienceLabel,
  badgeLabel,
  badgeOf,
  badgeVariant,
  isNotAtCommerce,
  shopDisplayPhrase,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { OperationImage } from '../operation-image/operation-image';

type LoadState = 'loading' | 'error' | 'closed' | 'ready';

/**
 * **Une opération, telle que le commerce la tient** — `/operations-commerce/:key`.
 * Lecture seule au lot 3 : ce que verra le client, l'annonce, les dates, la
 * sélection et ce qui en est en vente.
 */
@Component({
  selector: 'app-commerce-operation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    OperationImage,
  ],
  templateUrl: './commerce-operation-page.html',
  styleUrl: './commerce-operation-page.scss',
})
export class CommerceOperationPage {
  private readonly api = inject(CommerceOperationsService);

  readonly key = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly operation = signal<CommerceOperationView | null>(null);
  protected readonly failure = signal('');

  protected readonly badge = computed(() => {
    const operation = this.operation();
    return operation === null ? null : badgeOf(operation);
  });
  protected readonly badgeLabel = badgeLabel;
  protected readonly badgeVariant = badgeVariant;

  /** La sélection, chaque article dit vendu ou non. */
  protected readonly selection = computed(() => {
    const operation = this.operation();
    if (operation === null) {
      return [];
    }
    const selling = new Set(operation.sellingSkus);
    return operation.skus.map((sku) => ({ sku, selling: selling.has(sku) }));
  });

  protected readonly shopDisplay = (view: CommerceOperationView): string =>
    shopDisplayPhrase(view.shopDisplay);
  protected readonly audience = (view: CommerceOperationView): string =>
    audienceLabel(view.audience);
  protected readonly instant = formatInstant;
  protected readonly pickup = (view: CommerceOperationView): string =>
    pickupPhrase(view.pickupFrom, view.pickupUntil);

  constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => void this.load(key));
    });
  }

  protected async load(key: string): Promise<void> {
    this.state.set('loading');
    try {
      this.operation.set(await this.api.get(key));
      this.state.set('ready');
    } catch (error: unknown) {
      if (isNotAtCommerce(error)) {
        this.state.set('closed');
        return;
      }
      this.failure.set(httpErrorMessage(error, "L'opération n'a pas pu être lue."));
      this.state.set('error');
    }
  }
}
