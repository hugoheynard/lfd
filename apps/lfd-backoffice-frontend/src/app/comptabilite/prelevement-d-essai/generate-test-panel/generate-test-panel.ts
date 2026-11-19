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
import {
  TEST_SEQUENCE_LABELS,
  type CollectionTestDebtorPayload,
  type CollectionTestDebtorView,
  type CollectionTestDebtorsView,
  type TestSequenceView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { centsOf } from '../../cents-field';
import { CollectionTestsService } from '../../collection-tests.service';
import { day, euros } from '../../invoice-dossier-format';
import { GestureIntents } from '../../../shared/gesture-intents';

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
 * La séquence proposée d'office : `RCUR` dès que le mandat l'admet, comme les
 * vrais lots (réponse 20 de la banque ; D3 tranchée par Hugo le 2026-10-26) ;
 * sinon la seule que le serveur propose (`OOFF` sur un mandat ponctuel).
 */
export function defaultSequence(sequences: readonly TestSequenceView[]): TestSequenceView | null {
  return sequences.includes('RCUR') ? 'RCUR' : (sequences[0] ?? null);
}

/** Une ligne de l'envoi, telle que l'écran la tient : cochée, son montant saisi, sa séquence. */
export interface DraftLine {
  readonly amount: string;
  readonly sequence: TestSequenceView | null;
}

/** Le montant proposé d'office à une ligne cochée. */
const DEFAULT_AMOUNT = '1,00';

/** Le seul sujet d'intention du panneau : il n'en part qu'un envoi à la fois. */
const INTENT_SUBJECT = 'collection-test-file';

/**
 * L'échéance au plus tôt d'un envoi : la plus tardive des échéances au plus
 * tôt de ses lignes, puisqu'une échéance est commune à tout le fichier.
 */
export function earliestCommonDay(debtors: readonly CollectionTestDebtorView[]): string | null {
  return debtors.reduce<string | null>((latest, debtor) => {
    const day = debtor.earliestCollectionDay;
    return day !== null && (latest === null || day > latest) ? day : latest;
  }, null);
}

/**
 * **Générer un envoi de prélèvement d'essai** (plan
 * `plan-essai-a-plusieurs-debiteurs.md`, § 1.4) — un fichier, une ligne par
 * établissement coché, au plus `maxDebtorsPerFile`. Chaque ligne porte son
 * montant (au plus le plafond) et sa séquence ; l'échéance et le libellé sont
 * communs à l'envoi. L'écran ne fait que proposer : chaque refus est celui de
 * l'agrégat, affiché tel que le serveur le rédige.
 */
@Component({
  selector: 'app-generate-test-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
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
  /** Un envoi par intention : un double clic ne garde pas deux fichiers. */
  private readonly intents = new GestureIntents();
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input<GenerateTestPanelData | undefined>(undefined);

  /** Les lignes cochées, par société, dans l'ordre où elles l'ont été. */
  protected readonly lines = signal<ReadonlyMap<string, DraftLine>>(new Map());
  protected readonly collectionDay = signal('');
  protected readonly remittance = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly debtors = computed(() => {
    const tool = this.data()?.tool;
    return tool === undefined ? [] : eligibleDebtors(tool);
  });
  protected readonly maxLines = computed(() => this.data()?.tool.maxDebtorsPerFile ?? 0);
  protected readonly maxLabel = computed(() => euros(this.data()?.tool.maxAmountCents ?? 0));
  protected readonly defaultRemittance = computed(() => this.data()?.tool.defaultRemittance ?? '');

  protected readonly chosen = computed(() =>
    this.debtors().filter((debtor) => this.lines().has(debtor.companyId)),
  );
  protected readonly full = computed(() => this.lines().size >= this.maxLines());

  /**
   * Le `min` du sélecteur de date : la même borne que celle du serveur pour
   * les lignes cochées ; avant toute case, la plus proche des établissements.
   */
  protected readonly earliestDay = computed(() => {
    const chosen = this.chosen();
    if (chosen.length > 0) {
      return earliestCommonDay(chosen) ?? undefined;
    }
    const days = this.debtors().flatMap((debtor) => debtor.earliestCollectionDay ?? []);
    return days.length === 0 ? undefined : days.reduce((a, b) => (b < a ? b : a));
  });
  protected readonly earliestLabel = computed(() => {
    const earliest = this.earliestDay();
    return earliest === undefined ? '' : day(earliest);
  });

  /** Les lignes prêtes à partir ; `null` dès qu'une est incomplète. */
  private readonly payloadLines = computed<CollectionTestDebtorPayload[] | null>(() => {
    const payload: CollectionTestDebtorPayload[] = [];
    for (const [companyId, line] of this.lines()) {
      const amountCents = centsOf(line.amount);
      if (amountCents === null || line.sequence === null) {
        return null;
      }
      payload.push({ companyId, amountCents, sequence: line.sequence });
    }
    return payload;
  });

  /** « 2 lignes », ou ce qui manque. Chaque ligne montre son montant : l'écran n'additionne pas d'argent. */
  protected readonly summary = computed(() => {
    const count = this.lines().size;
    if (count === 0) {
      return 'Aucun établissement coché.';
    }
    const lines = count === 1 ? '1 ligne' : `${count} lignes`;
    const payload = this.payloadLines();
    if (payload === null) {
      return `${lines} — un montant est à reprendre.`;
    }
    return `${lines}.`;
  });

  protected readonly canSubmit = computed(
    () =>
      this.lines().size > 0 &&
      this.lines().size <= this.maxLines() &&
      this.payloadLines() !== null &&
      this.collectionDay() !== '' &&
      !this.saving(),
  );

  constructor() {
    // Une échéance plus tôt que ce que l'envoi admet remonte à sa borne.
    effect(() => {
      const earliest = this.earliestDay();
      if (earliest === undefined) {
        return;
      }
      const current = untracked(this.collectionDay);
      if (current === '' || current < earliest) {
        this.collectionDay.set(earliest);
      }
    });
  }

  protected isChecked(debtor: CollectionTestDebtorView): boolean {
    return this.lines().has(debtor.companyId);
  }

  /** Plus de case cochable une fois l'envoi plein ; une case cochée se décoche toujours. */
  protected isLocked(debtor: CollectionTestDebtorView): boolean {
    return this.full() && !this.isChecked(debtor);
  }

  protected lineOf(debtor: CollectionTestDebtorView): DraftLine | null {
    return this.lines().get(debtor.companyId) ?? null;
  }

  protected mandateHint(debtor: CollectionTestDebtorView): string {
    const mandate = debtor.mandate;
    return mandate === null
      ? ''
      : `Mandat ${mandate.reference} — schéma ${mandate.scheme}, compte ••••${mandate.ibanLast4}.`;
  }

  protected sequenceOptions(
    debtor: CollectionTestDebtorView,
  ): readonly { value: TestSequenceView; label: string }[] {
    return debtor.sequences.map((value) => ({ value, label: TEST_SEQUENCE_LABELS[value] }));
  }

  protected amountInvalid(debtor: CollectionTestDebtorView): boolean {
    const line = this.lineOf(debtor);
    return line !== null && centsOf(line.amount) === null;
  }

  protected toggle(debtor: CollectionTestDebtorView, checked: boolean): void {
    const next = new Map(this.lines());
    if (!checked) {
      next.delete(debtor.companyId);
    } else if (!next.has(debtor.companyId) && next.size < this.maxLines()) {
      next.set(debtor.companyId, {
        amount: DEFAULT_AMOUNT,
        sequence: defaultSequence(debtor.sequences),
      });
    }
    this.lines.set(next);
  }

  protected setAmount(debtor: CollectionTestDebtorView, amount: string): void {
    this.patch(debtor, { amount });
  }

  protected setSequence(debtor: CollectionTestDebtorView, sequence: TestSequenceView | null): void {
    this.patch(debtor, { sequence });
  }

  protected async submit(): Promise<void> {
    const debtors = this.payloadLines();
    if (debtors === null || debtors.length === 0) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const remittance = this.remittance().trim();
      const fileId = await this.api.generate(
        {
          debtors,
          requestedCollectionDay: this.collectionDay(),
          remittance: remittance === '' ? null : remittance,
        },
        this.intents.keyFor(INTENT_SUBJECT),
      );
      this.intents.done(INTENT_SUBJECT);
      this.ref.close(fileId);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le fichier d’essai n’a pas été généré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }

  private patch(debtor: CollectionTestDebtorView, change: Partial<DraftLine>): void {
    const line = this.lines().get(debtor.companyId);
    if (line === undefined) {
      return;
    }
    this.lines.set(new Map(this.lines()).set(debtor.companyId, { ...line, ...change }));
  }
}
