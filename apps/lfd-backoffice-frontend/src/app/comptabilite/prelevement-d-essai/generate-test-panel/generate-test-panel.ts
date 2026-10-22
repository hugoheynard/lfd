import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  TEST_SEQUENCE_LABELS,
  type CollectionTestDebtorView,
  type CollectionTestDebtorsView,
  type TestSequenceView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../../shared/download/save-blob';
import { centsOf } from '../../cents-field';
import { CollectionTestsService } from '../../collection-tests.service';
import { day, euros } from '../../invoice-dossier-format';

/** Ce que le panneau reçoit : l'outil tel que le serveur l'a jugé. */
export interface GenerateTestPanelData {
  readonly tool: CollectionTestDebtorsView;
}

/** Les établissements essayables — ceux que le serveur n'a pas refusés. */
export function eligibleDebtors(
  tool: CollectionTestDebtorsView,
): readonly CollectionTestDebtorView[] {
  return tool.debtors.filter((debtor) => debtor.refusal === null && debtor.sequences.length > 0);
}

/**
 * **Générer un prélèvement d'essai** (plan `plan-prelevement-d-essai.md`) —
 * un débiteur parmi nos établissements, un montant d'au plus le plafond,
 * l'échéance la plus proche (J + 2 jours ouvrés, sans pré-notification : Q6),
 * une séquence permise par le mandat. Le mandat choisi s'exporte aussi au
 * format d'import de la banque, seul. L'écran ne fait que proposer : chaque refus est celui de l'agrégat,
 * affiché tel que le serveur le rédige.
 */
@Component({
  selector: 'app-generate-test-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './generate-test-panel.html',
  styleUrl: './generate-test-panel.scss',
})
export class GenerateTestPanel {
  private readonly api = inject(CollectionTestsService);
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input<GenerateTestPanelData | undefined>(undefined);

  protected readonly companyId = signal<string | null>(null);
  protected readonly amount = signal('1,00');
  protected readonly collectionDay = signal('');
  protected readonly sequence = signal<TestSequenceView | null>(null);
  protected readonly remittance = signal('');
  protected readonly saving = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly debtors = computed(() => {
    const tool = this.data()?.tool;
    return tool === undefined ? [] : eligibleDebtors(tool);
  });
  protected readonly debtorOptions = computed(() =>
    this.debtors().map((debtor) => ({ value: debtor.companyId, label: debtor.companyName })),
  );
  protected readonly debtor = computed(
    () => this.debtors().find((debtor) => debtor.companyId === this.companyId()) ?? null,
  );
  protected readonly sequenceOptions = computed(() =>
    (this.debtor()?.sequences ?? []).map((value) => ({
      value,
      label: TEST_SEQUENCE_LABELS[value],
    })),
  );
  protected readonly maxLabel = computed(() => euros(this.data()?.tool.maxAmountCents ?? 0));
  protected readonly defaultRemittance = computed(() => this.data()?.tool.defaultRemittance ?? '');
  /** Le `min` du sélecteur de date : la même borne que celle du serveur. */
  protected readonly earliestDay = computed(
    () => this.debtor()?.earliestCollectionDay ?? undefined,
  );
  protected readonly earliestLabel = computed(() => {
    const earliest = this.debtor()?.earliestCollectionDay ?? null;
    return earliest === null ? '' : day(earliest);
  });

  private readonly amountCents = computed(() => centsOf(this.amount()));
  protected readonly amountInvalid = computed(() => this.amountCents() === null);

  protected readonly canSubmit = computed(
    () =>
      this.debtor() !== null &&
      this.amountCents() !== null &&
      this.collectionDay() !== '' &&
      this.sequence() !== null &&
      !this.saving(),
  );

  constructor() {
    // Un débiteur choisi propose SON échéance et SA première séquence.
    effect(() => {
      const debtor = this.debtor();
      this.collectionDay.set(debtor?.earliestCollectionDay ?? '');
      this.sequence.set(debtor?.sequences[0] ?? null);
    });
    effect(() => {
      const [first] = this.debtors();
      if (this.companyId() === null && first !== undefined) {
        this.companyId.set(first.companyId);
      }
    });
  }

  protected async submit(): Promise<void> {
    const companyId = this.companyId();
    const amountCents = this.amountCents();
    const sequence = this.sequence();
    if (companyId === null || amountCents === null || sequence === null) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const remittance = this.remittance().trim();
      const testId = await this.api.generate({
        companyId,
        amountCents,
        requestedCollectionDay: this.collectionDay(),
        sequence,
        remittance: remittance === '' ? null : remittance,
      });
      this.ref.close(testId);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le fichier d’essai n’a pas été généré.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Le CSV du seul mandat de l'établissement choisi, pour le portail de la banque. */
  protected async exportMandate(): Promise<void> {
    const debtor = this.debtor();
    if (debtor === null || debtor.mandate === null) {
      return;
    }
    this.exporting.set(true);
    this.error.set(null);
    try {
      const file = await this.api.mandateFile(debtor.companyId);
      saveBlob(file, `ESSAI-mandat-banque-${debtor.mandate.reference}.csv`);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le mandat n’a pas pu être exporté.'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
