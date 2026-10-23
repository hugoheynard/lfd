import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CollectionBatchView, CollectionProcedureReturnsView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { day } from '../../invoice-dossier-format';
import { BankReturns } from '../../prelevement-du-mois/bank-returns/bank-returns';

/**
 * **Onglet 4 — le contrôle des retours** du lot suivi (plan
 * `plan-page-procedure-de-prelevement.md` § 3.4). Les retours et leurs gestes
 * viennent de `app-bank-returns`, inclus. Suivi jusqu'à échéance + 5 jours
 * ouvrés (Q3) ; le contrôle quotidien attesté arrive en P3 — d'ici là,
 * l'onglet dit chaque jour de la fenêtre qu'il y a un contrôle à faire.
 */
@Component({
  selector: 'app-procedure-returns-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BankReturns, FoldCalloutComponent],
  templateUrl: './procedure-returns-step.html',
  styleUrl: './procedure-returns-step.scss',
})
export class ProcedureReturnsStep {
  readonly returns = input.required<CollectionProcedureReturnsView>();
  readonly batch = input<CollectionBatchView | null>(null);
  readonly canWrite = input(false);

  protected readonly batches = computed(() => {
    const batch = this.batch();
    return batch === null ? [] : [batch];
  });

  /** Ce que dit l'onglet, selon la raison que le serveur donne. */
  protected readonly sentence = computed(() => {
    const view = this.returns();
    const until = view.watchUntilDay === null ? '' : day(view.watchUntilDay);
    switch (view.reason) {
      case 'before_collection_day':
        return 'Rien à contrôler avant l’échéance : les impayés arrivent après elle, chaque jour.';
      case 'pending_returns':
        return `${String(view.pendingReturnCount)} retour(s) attendent un geste : re-présenter, régler autrement, ou passer en perte.`;
      case 'watching':
        return `Importer chaque jour le fichier d’impayés de la banque, jusqu’au ${until}. Un jour sans impayé n’écrit rien ici : l’outil ne peut pas encore attester ce contrôle.`;
      case 'watch_over':
        return 'Aucune action à mener : la fenêtre de suivi est passée et aucun retour n’attend. Un retour tardif reviendra par l’import et la cloche.';
      case 'not_deposited':
        return '';
    }
  });
}
