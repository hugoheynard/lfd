import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  COLLECTION_RETURN_KIND_LABELS,
  type BankReturnReasonView,
  type CollectionReturnKindView,
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

import { centsOf } from '../../cents-field';
import { CollectionReturnsService } from '../../collection-returns.service';
import { euros } from '../../invoice-dossier-format';

/** « Autre » : la norme le nomme `NARR`, et il se dit avec les mots de la banque. */
const NARRATIVE = 'NARR';

const KINDS: readonly CollectionReturnKindView[] = ['reject', 'return', 'refund_request'];

/** Les genres offerts : un lot B2B ne propose pas le remboursement. */
export function returnKindOptions(
  scheme: 'CORE' | 'B2B',
): readonly { readonly value: CollectionReturnKindView; readonly label: string }[] {
  return KINDS.filter((kind) => kind !== 'refund_request' || scheme !== 'B2B').map((kind) => ({
    value: kind,
    label: COLLECTION_RETURN_KIND_LABELS[kind],
  }));
}

/** Les frais saisis : `null` = aucun ; `undefined` = saisie illisible. */
export function feeCentsOf(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? null : (centsOf(trimmed) ?? undefined);
}

/** Ce que le panneau reçoit : la ligne visée, son lot, le schéma, la liste des motifs. */
export interface ReturnPanelData {
  readonly batchId: string;
  readonly rank: number;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly scheme: 'CORE' | 'B2B';
  readonly reasons: readonly BankReturnReasonView[];
}

/**
 * **« Signaler un retour »** sur une ligne déposée (plan
 * `plan-retours-bancaires.md`, R5a). Le montant est celui de la ligne —
 * un retour porte sur toute la ligne — et n'est donc pas saisi. Un lot B2B
 * ne propose pas le remboursement : le débiteur n'y a pas droit.
 */
@Component({
  selector: 'app-return-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './return-panel.html',
  styleUrl: './return-panel.scss',
})
export class ReturnPanel {
  private readonly api = inject(CollectionReturnsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ReturnPanelData | undefined>(undefined);

  protected readonly kind = signal<CollectionReturnKindView | null>('reject');
  protected readonly reasonCode = signal<string | null>(null);
  protected readonly reasonLabel = signal('');
  protected readonly returnedOn = signal('');
  protected readonly fee = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const line = this.data();
    return line === undefined
      ? ''
      : `Ligne ${line.rank} — ${line.debtorName} — ${euros(line.amountCents)}`;
  });

  protected readonly kindOptions = computed(() => returnKindOptions(this.data()?.scheme ?? 'CORE'));

  protected readonly reasonOptions = computed(() => [
    ...(this.data()?.reasons ?? []).map((reason) => ({
      value: reason.code,
      label: `${reason.code} — ${reason.label}`,
    })),
    { value: NARRATIVE, label: 'Autre — recopier le libellé de la banque' },
  ]);

  protected readonly narrative = computed(() => this.reasonCode() === NARRATIVE);

  private readonly feeCents = computed(() => feeCentsOf(this.fee()));

  protected readonly feeInvalid = computed(() => this.feeCents() === undefined);

  protected readonly canSubmit = computed(
    () =>
      this.kind() !== null &&
      this.reasonCode() !== null &&
      (!this.narrative() || this.reasonLabel().trim() !== '') &&
      this.returnedOn() !== '' &&
      !this.feeInvalid() &&
      !this.saving(),
  );

  protected async submit(): Promise<void> {
    const line = this.data();
    const kind = this.kind();
    const reasonCode = this.reasonCode();
    const feeCents = this.feeCents();
    if (line === undefined || kind === null || reasonCode === null || feeCents === undefined) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const label = this.reasonLabel().trim();
      await this.api.record(line.batchId, line.rank, {
        kind,
        reasonCode,
        reasonLabel: label === '' ? null : label,
        returnedOn: this.returnedOn(),
        feeCents,
      });
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le retour n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
