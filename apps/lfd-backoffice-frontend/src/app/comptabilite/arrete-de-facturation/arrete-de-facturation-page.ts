import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { BillingStatementView } from '@lfd/contracts';
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

import { BillingStatementsService } from '../billing-statements.service';
import { DossierInvoice } from '../invoice-dossier/dossier-invoice/dossier-invoice';
import { day, euros, signedEuros } from '../invoice-dossier-format';

type StatementState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * **Le dossier d'une ligne de prélèvement**, ouvert depuis son arrêté (plan
 * `documentation/comptabilite/facturation/plan-le-prelevement-suit-la-facture.md`, F4).
 *
 * Le périmètre exact du débit : ses bons, la facture calculée une fois sur
 * eux et figée à la constitution. Rien n'est recalculé — c'est ce total qui
 * part à la banque. Un arrêté annulé avec son lot se relit, et le dit.
 */
@Component({
  selector: 'app-arrete-de-facturation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DossierInvoice,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './arrete-de-facturation-page.html',
  styleUrl: './arrete-de-facturation-page.scss',
})
export class ArreteDeFacturationPage {
  private readonly api = inject(BillingStatementsService);

  /** Le segment `:id` de la route. */
  readonly id = input.required<string>();

  protected readonly state = signal<StatementState>('loading');
  protected readonly statement = signal<BillingStatementView | null>(null);

  protected readonly title = computed(() => {
    const statement = this.statement();
    return statement === null ? 'Arrêté de facturation' : `Arrêté — ${statement.buyer.name}`;
  });

  /** Total facturé − Σ bons : la seule soustraction de l'écran, entre deux montants figés. */
  protected readonly gap = computed(() => {
    const statement = this.statement();
    return statement === null
      ? ''
      : signedEuros(statement.totalTtcCents - statement.ordersTotalCents);
  });

  protected readonly euros = euros;
  protected readonly day = day;

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      this.statement.set(await this.api.one(id));
      this.state.set('ready');
    } catch (caught) {
      this.statement.set(null);
      this.state.set(
        caught instanceof HttpErrorResponse && caught.status === 404 ? 'not-found' : 'error',
      );
    }
  }

  protected period(statement: BillingStatementView): string {
    const { periodStartsOn: from, periodEndsOn: to } = statement;
    if (from === null || to === null) {
      return 'Aucun bon ne portait de date de livraison';
    }
    return from === to ? day(from) : `du ${day(from)} au ${day(to)}`;
  }
}
