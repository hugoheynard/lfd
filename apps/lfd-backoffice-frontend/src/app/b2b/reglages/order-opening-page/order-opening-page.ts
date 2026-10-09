import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CustomerAudience, OrderOpeningPatch, OrderOpeningView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { OrderOpeningService } from '../order-opening.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Ce que l'écran dit d'une clientèle : son nom, et l'effet de chaque bascule. */
interface AudienceWords {
  readonly title: string;
  readonly sentence: string;
  readonly closeEffect: string;
  readonly openEffect: string;
}

const WORDS: Readonly<Record<CustomerAudience, AudienceWords>> = {
  b2b: {
    title: 'Pros',
    sentence: 'La boutique prend les commandes des pros',
    closeEffect:
      'Les pros ne pourront plus passer de commande : leur catalogue et leurs prix restent visibles, et la boutique leur dit que les commandes sont fermées. Les commandes déjà passées ne changent pas, et l’équipe peut toujours saisir une commande pour eux.',
    openEffect: 'Les pros pourront de nouveau passer commande depuis la boutique.',
  },
  b2c: {
    title: 'Particuliers',
    sentence: 'La boutique prend les commandes des particuliers',
    closeEffect:
      'Les particuliers ne pourront plus passer de commande : le catalogue et les prix restent visibles, et la boutique leur dit que les commandes sont fermées. Les commandes déjà passées ne changent pas, et l’équipe peut toujours saisir une commande.',
    openEffect: 'Les particuliers pourront de nouveau passer commande depuis la boutique.',
  },
};

/** Une ligne de l'écran : une clientèle, son état servi, et ce que la bascule ferait. */
interface AudienceRow {
  readonly audience: CustomerAudience;
  readonly words: AudienceWords;
  readonly open: boolean;
}

/**
 * **Ouverture de la boutique** — « E-commerce LFC → Réglages » (Hugo,
 * 2026-10-09). Deux interrupteurs, un par clientèle.
 *
 * Fermée, la boutique garde son catalogue et ses prix : seules les passations
 * de la clientèle sont refusées (409). Chaque bascule passe par une
 * confirmation qui dit son effet — un clic de travers fermerait la boutique à
 * toute une clientèle (la leçon de « Livraison », 2026-09-15).
 *
 * L'écran ne décide rien : il pose le réglage, et le serveur l'applique.
 */
@Component({
  selector: 'app-order-opening-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './order-opening-page.html',
  styleUrl: './order-opening-page.scss',
})
export class OrderOpeningPage {
  private readonly service = inject(OrderOpeningService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<OrderOpeningView | null>(null);
  /** La clientèle dont la bascule est en vol ; `null` au repos. */
  protected readonly pending = signal<CustomerAudience | null>(null);
  /** Le dernier refus, en clair ; `null` quand le dernier envoi a abouti. */
  protected readonly failure = signal<string | null>(null);

  protected readonly rows = computed<readonly AudienceRow[]>(() => {
    const view = this.settings();
    if (view === null) {
      return [];
    }
    return [
      { audience: 'b2b', words: WORDS.b2b, open: view.ordersOpenToB2b },
      { audience: 'b2c', words: WORDS.b2c, open: view.ordersOpenToB2c },
    ];
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.settings.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Ce que la confirmation annonce : l'effet de la bascule proposée. */
  protected effect(row: AudienceRow): string {
    return row.open ? row.words.closeEffect : row.words.openEffect;
  }

  /** Bascule une clientèle, puis relit. Un refus laisse l'état servi, avec la raison. */
  protected async toggle(row: AudienceRow): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    const patch: OrderOpeningPatch =
      row.audience === 'b2b' ? { ordersOpenToB2b: !row.open } : { ordersOpenToB2c: !row.open };
    this.pending.set(row.audience);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.settings.set(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, "L'ouverture de la boutique n'a pas pu être enregistrée."),
      );
    } finally {
      this.pending.set(null);
    }
  }
}
