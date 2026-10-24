import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CollectionBatchView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
} from 'fold-ng';

import { cancellable, depositClosedReason, rejectableByBank } from '../../collection-batch-steps';
import { DEPOSIT_UNKNOWN } from '../../collection-schedule-wording';
import { unsentNoticePayers } from '../../collection-notice-wording';
import { batchAuthorLabel } from '../../autopilot-run-wording';
import { day, euros, instant } from '../../invoice-dossier-format';
import { BatchLines } from '../batch-lines/batch-lines';
import { periodWithModes } from '../../collection-month-wording';

/** Un geste sur le lot, que la page exécute — elle tient l'attente et les refus. */
export type PendingBatchGesture = 'xml' | 'csv' | 'deposit' | 'cancel' | 'rejected-by-bank';

/**
 * **Le lot à traiter** — préparé, pas encore déposé : ses dates, ses
 * signalements, ses lignes et ses gestes, dans l'ordre où on les fait.
 *
 * La date du prélèvement est celle FIGÉE sur le lot (PA1) : son fichier la
 * porte, et l'avis aussi. Quand une préparation tardive l'a repoussée pour
 * tenir le préavis (D4), l'écran dit de quelle date. La date limite de dépôt est calculée au réglage ACTUEL de l'entité ;
 * « à renseigner » tant que la banque ne l'a pas donnée.
 */
@Component({
  selector: 'app-pending-batch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BatchLines,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './pending-batch.html',
  styleUrl: './pending-batch.scss',
})
export class PendingBatch {
  readonly batch = input.required<CollectionBatchView>();
  readonly canWrite = input(false);
  readonly pending = input(false);
  /**
   * La rangée de gestes en pied de carte. L'onglet « Fichier » de la
   * procédure la remplace par sa barre au-dessus (2026-10-23).
   */
  readonly actions = input(true);

  readonly gesture = output<PendingBatchGesture>();

  protected readonly title = computed(() => {
    const batch = this.batch();
    return `Lot ${periodWithModes(batch.periodLabel, batch.payerModes)} — ${batch.scheme}`;
  });

  protected readonly collectionDay = computed(() => {
    const value = this.batch().requestedCollectionDay;
    return value === null ? 'celle du fichier (lot préparé avant le calendrier)' : day(value);
  });

  /** « repoussée du 15 octobre » — `null` quand le calendrier a été tenu. */
  protected readonly postponedFrom = computed(() => {
    const from = this.batch().postponedFromDay;
    return from === null ? null : day(from);
  });

  /** Les payeurs dont l'avis n'est pas parti : « Marquer déposé » sera refusé. */
  protected readonly unsentNotices = computed(() => unsentNoticePayers(this.batch()));

  protected readonly depositDeadline = computed(() => {
    const deadline = this.batch().depositDeadline;
    return deadline === null ? DEPOSIT_UNKNOWN : `avant le ${day(deadline.day)} à ${deadline.time}`;
  });

  /** Pourquoi « Marquer déposé » est fermé (non déposable, fichier jamais téléchargé). */
  protected readonly depositClosedReason = computed(() => depositClosedReason(this.batch()));
  /** « Annuler » : avant dépôt seulement — même règle que la procédure. */
  protected readonly cancellable = computed(() => cancellable(this.batch()));
  /** « La banque a rejeté ce fichier » : un lot déposé seulement (PSR1). */
  protected readonly rejectable = computed(() => rejectableByBank(this.batch()));

  protected readonly total = computed(() => euros(this.batch().totalCents));

  /** « Préparé automatiquement le … » — l'auteur est un genre, jamais un nom (PA3). */
  protected readonly preparedBy = computed(() => {
    const batch = this.batch();
    return `${batchAuthorLabel(batch)} le ${instant(batch.constitutedAt)}`;
  });
}
