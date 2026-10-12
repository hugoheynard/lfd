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
import { Router, RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  type FoldSelectOption,
  type FoldTableEmpty,
} from 'fold-ng';
import type { AdminOrderRow, CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../../commandes/orders.service';
import { OrdersTable } from '../../commandes/orders-table/orders-table';
import { ALL_SITES, siteChoicesOf, siteLabelOf } from './order-sites';

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
 * **Un principal voit aussi les commandes de ses sous-comptes** (structure
 * actuelle, `parent_company_id`), avec une colonne « Site » et un filtre. C'est
 * une vue de suivi : qui RÈGLE quoi, à date, est le relevé de cycle.
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
    FoldListboxComponent,
    OrdersTable,
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
  private readonly permissions = inject(PermissionsStore);

  /** La saisie exige `b2b_place_order:write` : sans lui, le lien promettrait un refus. */
  protected readonly canPlaceOrder = computed(() => this.permissions.can('b2b_place_order:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly AdminOrderRow[]>([]);
  private readonly sheet = signal<CustomerSheetView | null>(null);

  /** Le site filtré : `ALL_SITES`, le compte lui-même, ou un sous-compte. */
  protected readonly site = signal<string>(ALL_SITES);
  /** Lus sur la liste de tous les sites, et gardés pendant qu'on filtre. */
  protected readonly siteChoices = signal<FoldSelectOption<string>[]>([]);
  protected readonly hasSites = computed(() => this.siteChoices().length > 0);

  protected readonly recurringCount = computed<number>(
    () => this.sheet()?.stats.recurringBasketsCount ?? 0,
  );

  /** Vrai quand la page est pleine : au-delà, il manque peut-être des commandes. */
  protected readonly maybeTruncated = computed(() => this.rows().length === PAGE_SIZE);

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucune commande',
    subtitle: "Ce compte n'a encore rien commandé.",
  };

  /** Une flèche, pour être passée telle quelle au tableau partagé. */
  protected readonly siteOf = (row: AdminOrderRow): string => siteLabelOf(row, this.id());

  protected onSite(site: string): void {
    this.site.set(site);
    void this.load();
  }

  constructor() {
    // Un `input` de route n'est pas encore lié dans le constructeur, et il change
    // quand on passe d'un compte à l'autre sans quitter la page.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.site.set(ALL_SITES);
        this.siteChoices.set([]);
        void this.load(id);
      });
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      // Les deux appels sont indépendants : la liste vient de la route commandes,
      // le compte de paniers de la fiche commerciale. Les enchaîner aurait doublé
      // l'attente sans rien apporter.
      const site = this.site();
      const [rows, sheet] = await Promise.all([
        this.orders
          .list(
            site === ALL_SITES
              ? { companyId: id, withSubAccounts: true, limit: PAGE_SIZE }
              : { companyId: site, limit: PAGE_SIZE },
          )
          .then((page) => page.rows),
        this.sheets.sheet(id),
      ]);
      this.rows.set(rows);
      if (site === ALL_SITES) {
        this.siteChoices.set(siteChoicesOf(rows, id));
      }
      this.sheet.set(sheet);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Ouvrir une commande = aller sur sa page, **sans quitter le compte**.
   *
   * 🔴 Cette navigation visait `/commandes/:id`, qui vit hors de la coquille :
   * un clic sur une ligne faisait disparaître le bandeau du compte et ses
   * onglets, et le seul retour offert était la liste des comptes. On parcourt
   * les commandes d'un client par allers-retours — chacun coûtait deux
   * navigations et une relecture de la fiche.
   */
  protected openOrder(row: AdminOrderRow): void {
    // La commande d'un sous-compte s'ouvre sous SA fiche : son bandeau dit le site.
    void this.router.navigate([
      '/comptes-clients',
      row.companyId ?? this.id(),
      'commandes',
      row.id,
    ]);
  }
}
