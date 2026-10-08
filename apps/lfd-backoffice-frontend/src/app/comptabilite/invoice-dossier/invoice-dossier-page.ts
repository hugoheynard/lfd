import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DirectDebitBlockView, InvoiceDossierView, StatementCycleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { cycleLabel } from '../../fiche-client/facturation/cycle-statement-labels';
import { CycleStatementService } from '../../fiche-client/facturation/cycle-statement.service';
import { DirectDebitBlocksService } from '../direct-debit-blocks.service';
import { type InvoiceDossierSheet, InvoiceDossierService } from '../invoice-dossier.service';
import { DossierAlerts } from './dossier-alerts/dossier-alerts';
import { DossierGaps } from './dossier-gaps/dossier-gaps';
import { DossierInvoice } from './dossier-invoice/dossier-invoice';
import { DossierOrders } from './dossier-orders/dossier-orders';

/**
 * `idle` : rien de choisi. `conflict` : un bon figé empêche le calcul (409), et
 * le serveur le nomme. `not-found` : la société n'existe pas (404).
 */
export type DossierState = 'idle' | 'loading' | 'ready' | 'conflict' | 'not-found' | 'error';

/** Les trois fichiers, dans l'ordre de l'écran. */
const SHEETS: readonly { readonly sheet: InvoiceDossierSheet; readonly label: string }[] = [
  { sheet: 'invoice', label: 'La facture' },
  { sheet: 'orders', label: 'Les bons' },
  { sheet: 'gaps', label: 'Les écarts' },
];

/**
 * Vue **Dossier de facturation** de la Comptabilité (plan
 * `documentation/facturation/plan-simulateur-dossier-de-facturation.md`, DF4).
 *
 * Écrit pour qu'un expert-comptable refasse chaque chiffre à la main : les
 * signalements d'abord, puis la facture et sa ventilation, les écarts avec leurs
 * formules, enfin les bons. Rien n'est calculé ici.
 *
 * Les sociétés proposées sont celles **au crédit mensuel** (la liste des
 * blocages du prélèvement, sous le même droit) : le dossier vise les payeurs au
 * compte, et la liste de tous les comptes relève de `b2b_companies:read`.
 */
@Component({
  selector: 'app-invoice-dossier-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DossierAlerts,
    DossierGaps,
    DossierInvoice,
    DossierOrders,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './invoice-dossier-page.html',
  styleUrl: './invoice-dossier-page.scss',
})
export class InvoiceDossierPage {
  private readonly api = inject(InvoiceDossierService);
  private readonly cyclesApi = inject(CycleStatementService);
  private readonly companiesApi = inject(DirectDebitBlocksService);
  private readonly notify = inject(NotifyService);

  protected readonly sheets = SHEETS;
  protected readonly choicesFailed = signal(false);
  protected readonly companies = signal<readonly DirectDebitBlockView[]>([]);
  protected readonly cycles = signal<readonly StatementCycleView[]>([]);
  protected readonly companyId = signal<string | null>(null);
  protected readonly month = signal<string | null>(null);

  protected readonly state = signal<DossierState>('idle');
  /** Le message du serveur sur un 409 — il nomme le bon, on l'affiche tel quel. */
  protected readonly conflict = signal('');
  protected readonly dossier = signal<InvoiceDossierView | null>(null);
  protected readonly exporting = signal<InvoiceDossierSheet | null>(null);

  protected readonly companyChoices = computed<FoldSelectOption<string>[]>(() =>
    this.companies().map((company) => ({
      value: company.companyId,
      label: `${company.enseigne || company.raisonSociale} — ${company.reference}`,
    })),
  );

  protected readonly cycleChoices = computed<FoldSelectOption<string>[]>(() =>
    this.cycles().map((cycle) => ({ value: cycle.month, label: cycleLabel(cycle) })),
  );

  constructor() {
    void this.loadChoices();
  }

  protected async loadChoices(): Promise<void> {
    this.choicesFailed.set(false);
    try {
      const [companies, { cycles }] = await Promise.all([
        this.companiesApi.list(),
        this.cyclesApi.cycles(),
      ]);
      this.companies.set(companies);
      this.cycles.set(cycles);
      this.month.set(cycles[0]?.month ?? null);
    } catch {
      this.choicesFailed.set(true);
    }
  }

  protected onCompany(companyId: string): void {
    this.companyId.set(companyId);
    void this.load();
  }

  protected onMonth(month: string): void {
    this.month.set(month);
    void this.load();
  }

  protected async load(): Promise<void> {
    const companyId = this.companyId();
    const month = this.month();
    if (companyId === null || month === null) {
      return;
    }
    this.state.set('loading');
    try {
      this.dossier.set(await this.api.dossier(companyId, month));
      this.state.set('ready');
    } catch (error) {
      this.dossier.set(null);
      this.state.set(stateOfFailure(error));
      this.conflict.set(httpErrorMessage(error, 'Un bon empêche le calcul du dossier.'));
    }
  }

  protected async download(sheet: InvoiceDossierSheet): Promise<void> {
    const companyId = this.companyId();
    const month = this.month();
    if (companyId === null || month === null) {
      return;
    }
    this.exporting.set(sheet);
    try {
      const file = await this.api.exportCsv(companyId, month, sheet);
      saveBlob(file.blob, file.fileName ?? `DOSSIER-SIMULE-${sheet}-${month}.csv`);
    } catch (error) {
      this.notify.error(error, 'Le téléchargement a échoué. Réessayez dans un instant.');
    } finally {
      this.exporting.set(null);
    }
  }
}

/** 404 et 409 ont leur propre état ; tout le reste est une lecture échouée. */
export function stateOfFailure(error: unknown): DossierState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return 'not-found';
    }
    if (error.status === 409) {
      return 'conflict';
    }
  }
  return 'error';
}
