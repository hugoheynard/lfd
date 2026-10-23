import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  BankReturnCheckView,
  CollectionBatchView,
  CollectionProcedureReturnsView,
} from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { BankReturnChecksService } from '../../bank-return-checks.service';
import { day, instant } from '../../invoice-dossier-format';
import { BankReturns } from '../../prelevement-du-mois/bank-returns/bank-returns';
import {
  WithdrawReturnCheckPanel,
  type WithdrawReturnCheckPanelData,
} from '../withdraw-return-check-panel/withdraw-return-check-panel';
import { returnFigures, returnsSentence } from './procedure-returns-wording';

/**
 * **Onglet 4 — le contrôle des retours** du lot suivi (plan
 * `plan-page-procedure-de-prelevement.md` § 3.4). Les retours et leurs gestes
 * viennent de `app-bank-returns`, inclus ; ses gestes d'entrée sont dans une
 * barre AU-DESSUS (Hugo, 2026-10-23), comme les onglets Comptes, Mandats et
 * Fichier : « Importer le fichier de rejets de la banque », et en second
 * « Signaler un retour à la main ».
 *
 * P3 (2026-10-23) : « Retours contrôlés pour aujourd'hui » note que le
 * fichier du jour a été lu, impayés ou non. L'onglet nomme les jours ouvrés
 * de la fenêtre restés sans contrôle, et se rattrape jour par jour. Une
 * attestation ne conditionne aucun geste : elle ne gouverne que cet onglet.
 */
@Component({
  selector: 'app-procedure-returns-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BankReturns, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './procedure-returns-step.html',
  styleUrl: './procedure-returns-step.scss',
})
export class ProcedureReturnsStep {
  private readonly checks = inject(BankReturnChecksService);
  private readonly panels = inject(FoldPanelHostService);

  readonly returns = input.required<CollectionProcedureReturnsView>();
  readonly legalEntityId = input.required<string>();
  readonly batch = input<CollectionBatchView | null>(null);
  readonly canWrite = input(false);

  /** Un geste a abouti — l'hôte relit l'état de la procédure. */
  readonly changed = output();

  private readonly bankReturns = viewChild(BankReturns);

  protected readonly checking = signal<string | null>(null);
  protected readonly checkError = signal<string | null>(null);

  protected readonly batches = computed(() => {
    const batch = this.batch();
    return batch === null ? [] : [batch];
  });

  protected readonly sentence = computed(() => returnsSentence(this.returns()));
  protected readonly figures = computed(() => returnFigures(this.returns().figures));

  /** Les jours passés sans contrôle — aujourd'hui a son propre bouton. */
  protected readonly pastMissing = computed(() => {
    const view = this.returns();
    return view.missingCheckDays.filter((missing) => missing !== view.today);
  });

  protected readonly pastMissingList = computed(() =>
    this.pastMissing()
      .map((missing) => day(missing))
      .join(', '),
  );

  protected readonly day = day;

  protected checkedLabel(check: BankReturnCheckView): string {
    const by = check.byName === null ? '' : ` par ${check.byName}`;
    return `le ${instant(check.at)}${by}`;
  }

  protected async importFile(): Promise<void> {
    await this.bankReturns()?.importFile();
  }

  protected async signalByHand(): Promise<void> {
    await this.bankReturns()?.signalByChoice();
  }

  /** « Retours contrôlés » — aujourd'hui (`null`) ou un jour passé oublié. */
  protected async attest(checkDay: string | null): Promise<void> {
    this.checking.set(checkDay ?? this.returns().today);
    this.checkError.set(null);
    try {
      await this.checks.attest(this.legalEntityId(), checkDay);
      this.changed.emit();
    } catch (caught) {
      this.checkError.set(httpErrorMessage(caught, 'Le contrôle n’a pas pu être noté.'));
    } finally {
      this.checking.set(null);
    }
  }

  protected async withdraw(checkDay: string): Promise<void> {
    const data: WithdrawReturnCheckPanelData = {
      legalEntityId: this.legalEntityId(),
      day: checkDay,
    };
    const done = await this.panels.open<WithdrawReturnCheckPanelData, boolean>(
      WithdrawReturnCheckPanel,
      { data, width: 'md' },
    ).closed;
    if (done === true) {
      this.changed.emit();
    }
  }
}
