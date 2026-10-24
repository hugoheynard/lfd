import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  CollectionBatchAttestationsView,
  CollectionBatchView,
  CollectionProcedureView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import { tightDepositMarginSentence } from '../../collection-schedule-wording';
import { longDay } from '../../collection-month-wording';
import { PendingBatch, type PendingBatchGesture } from '../pending-batch/pending-batch';
import { ProcedureBatchActions } from '../procedure-batch-actions/procedure-batch-actions';
import { ProcedureBatchAttestations } from '../procedure-batch-attestations/procedure-batch-attestations';
import { collectionDayLabel, deadlineLabel } from '../procedure-wording';
import {
  DEBTOR_GAP_STEP_LABEL,
  debtorGapMissing,
  debtorGapStep,
  debtorGapsHeadline,
} from './debtor-gap-wording';

/**
 * **Onglet 3 — le fichier du lot suivi** (plan
 * `plan-page-procedure-de-prelevement.md` § 3.3, lot P2). Réutilise
 * `app-pending-batch` pour les gestes du lot ; ne verrouille rien sur l'onglet
 * 2. Depuis le 2026-10-24 (P4 révisé), il nomme les débiteurs DU LOT dont le
 * compte ou le mandat n'est pas importé dans CENET, avec l'onglet qui le
 * règle — un avertissement : la banque ne contrôle pas son référentiel au
 * dépôt d'un fichier (réponse 15). Plus d'avertissement à l'échelle de
 * l'entité : les onglets 1 et 2 le portent.
 *
 * Une procédure porte jusqu'à deux lots (CORE et B2B) : tous sont montrés
 * ici, sans « suivre » (2026-10-23).
 *
 * L'heure limite est en tête ; les gestes faits sur CENET (dépôt, signature)
 * sont dits comme tels — l'outil ne peut pas les vérifier. Depuis le
 * 2026-10-23, les gestes de chaque lot sont dans une barre AU-DESSUS de sa
 * carte (`app-procedure-batch-actions`), comme les onglets Comptes et
 * Mandats ; sans limite de dépôt réglée, aucun délai n'est proposé — un lien
 * mène au réglage de l'entité.
 *
 * P3 (2026-10-24) : sous la barre de chaque lot, ses attestations — contrôle
 * CSV relu, remise signée sur CENET, comptes rendus PSR lus. Déposé, l'onglet
 * attend « J'ai signé la remise sur CENET » ; il est fait quand elle est
 * cochée. Aucune attestation ne ferme un geste.
 */
/** Un geste sur un autre lot de la procédure que le lot suivi. */
export interface OtherBatchGesture {
  readonly batchId: string;
  readonly gesture: PendingBatchGesture;
}

const NO_ATTESTATION: CollectionBatchAttestationsView = {
  audit_reviewed: null,
  remittance_signed: null,
  psr_read: null,
};

@Component({
  selector: 'app-procedure-file-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    PendingBatch,
    ProcedureBatchActions,
    ProcedureBatchAttestations,
    RouterLink,
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
  /** Mène à l'onglet qui règle l'écart d'un débiteur. */
  readonly openStep = output<'accounts' | 'mandates'>();
  /** Une attestation posée ou retirée — l'hôte relit l'état de la procédure. */
  readonly changed = output();

  protected readonly followed = computed(() => this.view().followed);
  protected readonly file = computed(() => this.view().file);

  protected readonly marginWarning = computed(() => {
    const margin = this.file().tightDepositMargin;
    return margin === null ? null : tightDepositMarginSentence(margin);
  });

  /** « Rejeté le 3 novembre 2026 par Claire Compta : motif. » — lu sur le lot du cycle. */
  protected readonly rejectionSubtitle = computed(() => {
    const rejection = this.batch()?.rejection ?? null;
    if (rejection === null) {
      return 'Ses bons redeviennent à prélever : préparer le lot de nouveau.';
    }
    const by = rejection.byName === null ? '' : ` par ${rejection.byName}`;
    return `Déclaré rejeté le ${longDay(rejection.at)}${by} : « ${rejection.reason} ». Ses bons redeviennent à prélever.`;
  });

  protected readonly gaps = computed(() => this.file().debtorsNotImported);
  protected readonly gapsHeadline = computed(() => debtorGapsHeadline(this.gaps().length));
  protected readonly missing = debtorGapMissing;
  protected readonly step = debtorGapStep;
  protected readonly stepLabel = DEBTOR_GAP_STEP_LABEL;

  /** Les attestations d'un lot de la procédure, lues dans l'état du serveur. */
  protected attestationsOf(batchId: string): CollectionBatchAttestationsView {
    const view = this.view();
    const found = [
      ...view.procedureBatches,
      ...(view.followed === null ? [] : [view.followed]),
    ].find((lot) => lot.id === batchId);
    return found?.attestations ?? NO_ATTESTATION;
  }

  protected readonly deadline = deadlineLabel;
  protected readonly collectionDay = collectionDayLabel;
  protected readonly longDay = longDay;
}
