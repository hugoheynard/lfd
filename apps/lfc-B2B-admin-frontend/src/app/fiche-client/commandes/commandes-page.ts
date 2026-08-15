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
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldDataTableCellDirective,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import { ORDER_ORIGIN_LABELS, type AdminOrderRow, type CustomerSheetView } from '@lfd/contracts';
import {
  formatCents,
  formatOrderDate,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '@lfd/b2b-ui/order';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { AdminOrdersService } from '../../commandes/orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de commandes on ramène d'un coup — au-delà, il faudra paginer. */
const PAGE_SIZE = 50;

/**
 * **Commandes** d'un compte : ce qu'il a acheté, et à quel rythme.
 *
 * La liste vient de `GET /admin/orders?companyId=…` — la vraie route staff, pas
 * les quelques dernières commandes que la fiche commerciale calculait pour son
 * résumé. Chaque ligne s'ouvre sur le détail, qui est **l'écran du client** : au
 * téléphone, les deux doivent lire la même chose.
 *
 * **Un tableau, et non des rangées**, contrairement à la colonne de l'écran de
 * saisie : ici on compare. Des colonnes alignées laissent parcourir les montants
 * ou repérer un règlement en attente d'un coup d'œil vertical — ce qu'une suite
 * de rangées, si fines soient-elles, ne permet pas.
 *
 * Une limite demeure, dite à l'écran : les **paniers récurrents ne sont comptés
 * que globalement**, faute de route `/admin` qui les liste.
 */
@Component({
  selector: 'app-client-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldDataTableCellDirective,
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

  /**
   * Les colonnes, dans l'ordre où on les lit : ce qui identifie, puis quand,
   * puis où ça en est, puis combien. Le montant à droite et en `tabular-nums`,
   * parce que c'est la seule colonne qu'on compare de haut en bas.
   */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'orderNumber', label: 'Commande' },
    { key: 'placedAt', label: 'Passée le', width: '9rem' },
    { key: 'status', label: 'Avancement', width: '10rem' },
    { key: 'paymentStatus', label: 'Règlement', width: '10rem' },
    { key: 'totalCents', label: 'Total TTC', width: '8rem', align: 'right' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucune commande',
    subtitle: "Ce compte n'a encore rien commandé.",
  };

  protected readonly rowKey = (row: AdminOrderRow): string => row.id;

  protected date(row: AdminOrderRow): string {
    return formatOrderDate(row.placedAt);
  }

  protected total(row: AdminOrderRow): string {
    return formatCents(row.totalCents);
  }

  protected status(row: AdminOrderRow): string {
    return orderStatusLabel(row.status);
  }

  protected statusTone(row: AdminOrderRow): ReturnType<typeof orderStatusVariant> {
    return orderStatusVariant(row.status);
  }

  protected payment(row: AdminOrderRow): string {
    return paymentStatusLabel(row.paymentStatus);
  }

  protected paymentTone(row: AdminOrderRow): ReturnType<typeof paymentStatusVariant> {
    return paymentStatusVariant(row.paymentStatus);
  }

  /** La provenance, sauf quand c'est le cas normal — cf. `OrderRow`. */
  protected origin(row: AdminOrderRow): string | null {
    return row.origin === 'self_service' ? null : ORDER_ORIGIN_LABELS[row.origin];
  }

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

  /** Ouvrir une commande = aller sur sa page. Le tableau n'en décide pas. */
  protected openOrder(row: AdminOrderRow): void {
    void this.router.navigate(['/commandes', row.id]);
  }
}
