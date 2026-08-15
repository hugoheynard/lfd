import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type { AdminOrderRow } from '@lfd/contracts';
import {
  formatCents,
  formatOrderDate,
  paymentStatusLabel,
  paymentStatusVariant,
} from '@lfd/b2b-ui/order';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { NotifyService } from '../../notify.service';
import { periodCsv, periodFileName } from './billing-csv';
import {
  groupByYear,
  ledgerRows,
  periodDueDate,
  splitForBilling,
  yearOf,
  type LedgerRow,
  type YearGroup,
} from './billing-periods';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de commandes on ramène. Plafond serveur = 200. */
const ORDERS_WINDOW = 200;

/**
 * **Facturation** d'un compte : ce qu'il reste à facturer, et ce qui est déjà
 * réglé.
 *
 * Deux colonnes, et le partage tient à une colonne de la base : `payment_status`
 * vaut `not_required` **exactement quand** la commande part sur le terme
 * mensuel. À gauche ces commandes-là, rangées par mois, la **période en cours**
 * en tête ; à droite celles réglées à la commande.
 *
 * **C'est une lecture, pas un moteur.** Aucune facture n'existe dans le système
 * (cf. [`architecture-facturation.md`](../../../../../documentation/b2b/architecture-facturation.md)) :
 * cet écran rassemble ce qui devra l'être, pour que le chiffre se reporte dans
 * le logiciel comptable sans être recomposé à la main. Il n'invente donc ni
 * numéro, ni statut de facture, ni échéance négociée — la date annoncée est la
 * **clôture** de la période, calculée, et l'écran le dit.
 */
@Component({
  selector: 'app-client-facturation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './facturation-page.html',
  styleUrl: './facturation-page.scss',
})
export class ClientFacturationPage {
  readonly id = input.required<string>();

  private readonly orders = inject(AdminOrdersService);
  private readonly companies = inject(AdminCompaniesService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  private readonly rows = signal<readonly AdminOrderRow[]>([]);
  private readonly company = signal<AdminCompanyDetail | null>(null);

  protected readonly split = computed(() => splitForBilling(this.rows(), new Date()));

  /** La période qui accumule encore — `null` si rien n'a été porté au compte ce mois-ci. */
  protected readonly openPeriod = computed(
    () => this.split().periods.find((period) => period.open) ?? null,
  );

  /** Les périodes closes, la plus récente d'abord. */
  protected readonly closedPeriods = computed(() =>
    this.split().periods.filter((period) => !period.open),
  );

  /**
   * Le registre, **par année**. Un exercice se lit année par année, et le
   * passage de l'une à l'autre est une rupture, pas une ligne de plus.
   *
   * Une seule grille pour les deux régimes : août au compte et août à la
   * commande partagent la ligne, donc la hauteur. Deux colonnes indépendantes
   * auraient glissé l'une par rapport à l'autre dès le premier mois dépareillé.
   */
  protected readonly years = computed<readonly YearGroup<LedgerRow>[]>(() =>
    groupByYear(ledgerRows(this.split()), (row) => yearOf(row.key)),
  );

  /** Le compte règle-t-il au mois ? Faux ⇒ la colonne de gauche s'explique. */
  protected readonly onAccount = computed(() => (this.company()?.grantedTerms.length ?? 0) > 0);

  /** Ce qui a été réglé à l'unité, en centimes — le pendant du total « au compte ». */
  protected readonly perOrderTotalCents = computed(() =>
    this.split().perOrder.reduce((sum, order) => sum + order.totalCents, 0),
  );

  /** Vrai quand la fenêtre de lecture est pleine : les mois anciens sont incomplets. */
  protected readonly maybeTruncated = computed(() => this.rows().length === ORDERS_WINDOW);

  protected euros(cents: number): string {
    return formatCents(cents);
  }

  protected day(iso: string): string {
    return formatOrderDate(iso);
  }

  protected closingOf(key: string): string {
    return formatOrderDate(periodDueDate(key));
  }

  protected payment(row: AdminOrderRow): string {
    return paymentStatusLabel(row.paymentStatus);
  }

  protected paymentTone(row: AdminOrderRow): ReturnType<typeof paymentStatusVariant> {
    return paymentStatusVariant(row.paymentStatus);
  }

  protected openOrder(row: AdminOrderRow): void {
    void this.router.navigate(['/commandes', row.id]);
  }

  /**
   * Télécharge le relevé d'un mois — les deux régimes dans une seule table.
   *
   * Fabriqué **dans le navigateur**, depuis ce qui est déjà à l'écran : le
   * serveur n'a rien à rendre qu'il ne rende déjà, et un export qui repasserait
   * par lui pourrait dire autre chose que la page qu'on regarde. Le jour où le
   * volume dépassera la fenêtre de lecture, c'est une route qu'il faudra — et
   * l'écran le dit déjà quand la fenêtre est pleine.
   */
  protected exportPeriod(row: LedgerRow): void {
    const csv = periodCsv(row, (order) => paymentStatusLabel(order.paymentStatus));
    const name = periodFileName(this.company()?.reference ?? '', row.key);
    // `text/csv` et non `application/octet-stream` : le système propose alors le
    // tableur, au lieu de demander quoi faire du fichier.
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // Libéré au tour suivant : révoquer dans la foulée annule le téléchargement
    // sur certains navigateurs, qui n'ont pas encore lu le blob.
    setTimeout(() => URL.revokeObjectURL(url));
    this.notify.success(`Relevé ${row.month} exporté.`);
  }

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      const [rows, company] = await Promise.all([
        this.orders.list({ companyId: id, limit: ORDERS_WINDOW }),
        this.companies.getById(id),
      ]);
      this.rows.set(rows);
      this.company.set(company ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
