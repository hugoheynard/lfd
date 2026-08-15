import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type { AdminOrderRow, CustomerSheetView } from '@lfd/contracts';
import { OrderRow } from '@lfd/b2b-ui/order';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { AdminOrdersService } from '../../commandes/orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de commandes on ramène d'un coup — au-delà, il faudra paginer. */
const PAGE_SIZE = 50;

/**
 * **Commandes** d'un compte : ce qu'il a acheté, et à quel rythme.
 *
 * La liste vient désormais de `GET /admin/orders?companyId=…` — la vraie route
 * staff, pas les quelques dernières commandes que la fiche commerciale calculait
 * pour son résumé. Chaque ligne s'ouvre sur le détail, qui est **l'écran du
 * client** : au téléphone, les deux doivent lire la même chose.
 *
 * Une limite demeure, dite à l'écran : les **paniers récurrents ne sont comptés
 * que globalement**, faute de route `/admin` qui les liste.
 */
@Component({
  selector: 'app-client-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    OrderRow,
    RouterLink,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class ClientCommandesPage {
  readonly id = input.required<string>();

  private readonly sheets = inject(CustomerSheetService);
  private readonly orders = inject(AdminOrdersService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly AdminOrderRow[]>([]);
  private readonly sheet = signal<CustomerSheetView | null>(null);

  protected readonly recurringCount = computed<number>(
    () => this.sheet()?.stats.recurringBasketsCount ?? 0,
  );

  /** Vrai quand la page est pleine : au-delà, il manque peut-être des commandes. */
  protected readonly maybeTruncated = computed(() => this.rows().length === PAGE_SIZE);

  constructor() {
    // Un `input` de route n'est pas encore lié dans le constructeur, et il change
    // quand on passe d'un compte à l'autre sans quitter la page.
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      // Les deux appels sont indépendants : la liste vient de la route commandes,
      // le compte de paniers de la fiche commerciale. Les enchaîner aurait doublé
      // l'attente sans rien apporter.
      const [rows, sheet] = await Promise.all([
        this.orders.list({ companyId: id, limit: PAGE_SIZE }),
        this.sheets.sheet(id),
      ]);
      this.rows.set(rows);
      this.sheet.set(sheet);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Ouvrir une commande = aller sur sa page. La rangée n'en décide pas. */
  protected openOrder(row: AdminOrderRow): void {
    void this.router.navigate(['/commandes', row.id]);
  }
}
