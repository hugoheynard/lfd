import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldCardComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NO_FILTERS, filtersToQuery, type OrderListFilters } from '../order-list-filters';
import { AdminOrdersService } from '../orders.service';
import { scopeCards, type OrdersScope, type ScopeCard } from '../orders-scope';
import { watchGlobalSubjects } from '../../shared/version/watch-global-subjects';

const SCOPES: readonly FoldViewToggleOption[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'tomorrow', label: 'Demain' },
  { value: 'all', label: 'Toutes' },
];

/** Un compte et son état : `null` tant qu'il n'est pas lu, ou si la lecture a échoué. */
interface CountedCard extends ScopeCard {
  readonly count: number | null;
}

function isScope(value: string): value is OrdersScope {
  return value === 'today' || value === 'tomorrow' || value === 'all';
}

/**
 * **Le masthead de la liste des commandes** : le cadrage (aujourd'hui, demain,
 * toutes) et les quelques comptes qu'on y regarde d'abord.
 *
 * Chaque compte est le `total` de `GET /admin/orders` sous les filtres de sa
 * carte, lu avec `limit=1` : le serveur compte, rien n'est recalculé ici — le
 * chiffre d'une carte est exactement la longueur de la liste qu'elle ouvre.
 * Les comptes ignorent les filtres posés sous le masthead : ils décrivent le
 * jour, pas la recherche en cours.
 */
@Component({
  selector: 'app-orders-list-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldSurfaceDirective, FoldViewToggleComponent],
  templateUrl: './orders-list-masthead.html',
  styleUrl: './orders-list-masthead.scss',
})
export class OrdersListMasthead {
  /** Le cadrage lu dans l'adresse ; `null` pour une plage posée à la main. */
  readonly scope = input.required<OrdersScope | null>();
  /** Le jour de Paris de référence, `AAAA-MM-JJ`. */
  readonly today = input.required<string>();

  readonly scopeChange = output<OrdersScope>();
  /** Une carte choisie : les filtres complets à poser, onglet compris. */
  readonly picked = output<OrderListFilters>();

  private readonly orders = inject(AdminOrdersService);

  protected readonly scopes = SCOPES;
  /** Sans cadrage reconnu, les cartes de « Toutes » : elles ne supposent aucun jour. */
  protected readonly shown = computed<OrdersScope>(() => this.scope() ?? 'all');
  protected readonly cards = signal<readonly CountedCard[]>([]);

  private generation = 0;

  constructor() {
    effect(() => {
      const scope = this.shown();
      const today = this.today();
      untracked(() => void this.count(scope, today));
    });
    watchGlobalSubjects(['orders-all'], () => this.count(this.shown(), this.today(), true));
  }

  protected choose(value: string): void {
    if (isScope(value)) this.scopeChange.emit(value);
  }

  protected pick(card: ScopeCard): void {
    this.picked.emit({ ...NO_FILTERS, ...card.filters });
  }

  /** `quiet` : relecture de fond, les chiffres restent affichés jusqu'aux nouveaux. */
  private async count(scope: OrdersScope, today: string, quiet = false): Promise<void> {
    const generation = ++this.generation;
    const defs = scopeCards(scope, today);
    if (!quiet) this.cards.set(defs.map((card) => ({ ...card, count: null })));
    const counts = await Promise.all(
      defs.map((card) =>
        this.orders
          .list({ ...filtersToQuery({ ...NO_FILTERS, ...card.filters }), limit: 1 })
          .then((page) => page.total)
          .catch(() => null),
      ),
    );
    if (generation !== this.generation) return;
    this.cards.set(defs.map((card, index) => ({ ...card, count: counts[index] ?? null })));
  }
}
