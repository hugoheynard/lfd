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
import { periodDueDate, splitForBilling } from './billing-periods';

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

  /** Le compte règle-t-il au mois ? Faux ⇒ la colonne de gauche s'explique. */
  protected readonly onAccount = computed(() => (this.company()?.grantedTerms.length ?? 0) > 0);

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
