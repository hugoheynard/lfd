import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CollectionBatchView } from '@lfd/contracts';
import { FoldButtonComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { cancellable, depositClosedReason, rejectableByBank } from '../../collection-batch-steps';
import type { PendingBatchGesture } from '../pending-batch/pending-batch';

/**
 * **La barre d'actions d'un lot**, au-dessus de sa carte — même forme que les
 * onglets Comptes et Mandats (Hugo, 2026-10-23) : télécharger, « J'ai déposé
 * le fichier dans CENET » (fermé tant que le fichier de CE lot n'a pas été
 * téléchargé), le contrôle CSV en second, « Annuler » en retrait et seulement
 * avant dépôt ; « La banque a rejeté ce fichier » sur un lot déposé
 * seulement (plan `plan-lot-rejete-par-la-banque.md`).
 *
 * Le dépôt et la signature se font sur CENET : l'outil ne les voit pas. D'où
 * l'aide d'une ligne qui rappelle l'ordre — « J'ai déposé » AVANT de signer.
 */
@Component({
  selector: 'app-procedure-batch-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInlineConfirmComponent],
  templateUrl: './procedure-batch-actions.html',
  styleUrl: './procedure-batch-actions.scss',
})
export class ProcedureBatchActions {
  readonly batch = input.required<CollectionBatchView>();
  readonly canWrite = input(false);
  readonly pending = input(false);

  readonly gesture = output<PendingBatchGesture>();

  protected readonly closedReason = computed(() => depositClosedReason(this.batch()));
  protected readonly cancellable = computed(() => cancellable(this.batch()));
  /** Un lot déposé dont la banque a refusé le fichier entier (PSR1). */
  protected readonly rejectable = computed(() => rejectableByBank(this.batch()));
}
