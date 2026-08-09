import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type { CustomerOrderLine, CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { euros } from '../../commercial/calendrier/customer-sheet/customer-format';

type LoadState = 'loading' | 'ready' | 'error';

/** Une commande, prête à lire. */
interface OrderRow {
  readonly order: CustomerOrderLine;
  readonly placedAt: string;
  readonly total: string;
}

/**
 * **Commandes** d'un compte : ce qu'il a acheté, et à quel rythme.
 *
 * Deux limites, dites à l'écran plutôt que tues : la liste est **plafonnée aux
 * dernières commandes** (c'est ce que la fiche commerciale calcule), et les
 * **paniers récurrents ne sont montrés qu'en nombre** — il n'existe aucune route
 * `/admin` qui les liste, pas plus qu'une route qui liste toutes les commandes.
 *
 * C'est la même lacune que celle relevée à l'audit (aucune surface admin sur la
 * commande) : cette page en montre la moitié disponible aujourd'hui, et le dira
 * tant que l'autre moitié n'existe pas.
 */
@Component({
  selector: 'app-client-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class ClientCommandesPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerSheetService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly sheet = signal<CustomerSheetView | null>(null);

  protected readonly rows = computed<readonly OrderRow[]>(() =>
    (this.sheet()?.recentOrders ?? []).map((order) => ({
      order,
      placedAt: new Date(order.placedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      total: euros(order.totalCents),
    })),
  );

  protected readonly recurringCount = computed<number>(
    () => this.sheet()?.stats.recurringBasketsCount ?? 0,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.sheet.set(await this.api.sheet(this.id()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
