import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CollectionBatchView, CollectionProcedureView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import { tightDepositMarginSentence } from '../../collection-schedule-wording';
import { longDay } from '../../collection-month-wording';
import {
  PendingBatch,
  type PendingBatchGesture,
} from '../../prelevement-du-mois/pending-batch/pending-batch';
import { collectionDayLabel, deadlineLabel } from '../procedure-wording';

/**
 * **Onglet 3 — le fichier du lot suivi** (plan
 * `plan-page-procedure-de-prelevement.md` § 3.3, lot P2). Réutilise
 * `app-pending-batch` pour les gestes du lot ; ne verrouille rien sur l'onglet
 * 2 : sans S2 (P4), il AVERTIT des mandats non importés de l'entité.
 *
 * Une procédure porte jusqu'à deux lots (CORE et B2B) : tous sont montrés
 * ici, sans « suivre » (2026-10-23).
 *
 * L'heure limite est en tête ; les gestes faits sur CENET (dépôt, signature)
 * sont dits comme tels — l'outil ne peut pas les vérifier.
 */
/** Un geste sur un autre lot de la procédure que le lot suivi. */
export interface OtherBatchGesture {
  readonly batchId: string;
  readonly gesture: PendingBatchGesture;
}

@Component({
  selector: 'app-procedure-file-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    PendingBatch,
  ],
  templateUrl: './procedure-file-step.html',
  styleUrl: './procedure-file-step.scss',
})
export class ProcedureFileStep {
  readonly view = input.required<CollectionProcedureView>();
  /** Le lot suivi tel que « Prélèvement du mois » le lit — `null` s'il n'y en a pas. */
  readonly batch = input<CollectionBatchView | null>(null);
  readonly canWrite = input(false);
  readonly pending = input<string | null>(null);

  /** Les autres lots vivants de la procédure (l'autre schéma, le lot préparé de nouveau). */
  readonly others = input<readonly CollectionBatchView[]>([]);

  readonly gesture = output<PendingBatchGesture>();
  readonly otherGesture = output<OtherBatchGesture>();
  readonly prepare = output();

  protected readonly followed = computed(() => this.view().followed);
  protected readonly file = computed(() => this.view().file);

  protected readonly marginWarning = computed(() => {
    const margin = this.file().tightDepositMargin;
    return margin === null ? null : tightDepositMarginSentence(margin);
  });

  protected readonly deadline = deadlineLabel;
  protected readonly collectionDay = collectionDayLabel;
  protected readonly longDay = longDay;
}
