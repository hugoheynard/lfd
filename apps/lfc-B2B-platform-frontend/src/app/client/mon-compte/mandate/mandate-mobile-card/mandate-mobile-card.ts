import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCompany } from '../../../client-company.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { MandateBlockers } from '../mandate-blockers/mandate-blockers';
import { downloadMandate, openMandate } from '../mandate-document';
import { MandateOptionsPanel } from '../mandate-options-panel/mandate-options-panel';
import { MandatePanel } from '../mandate-panel/mandate-panel';
import { MandateProofDialog } from '../mandate-proof-dialog/mandate-proof-dialog';
import {
  mandateActionLabel,
  mandateDetailLabel,
  mandateOptionsEditable,
  mandatePrintable,
  mandateReferenceLabel,
  mandateStage,
  mandateStateLabel,
} from '../mandate-section';

/**
 * La carte **Mandat SEPA** en pile, son propre panneau du rail juste après le
 * RIB : l'état, la RUM, les deux icônes du brouillon, et le bouton pleine
 * largeur qui ouvre le panneau — ou, pour renvoyer le brouillon signé, le
 * dialogue de dépôt. La consigne détaillée est dans l'un et l'autre ; le dépôt
 * et la signature électronique, dans le dialogue.
 *
 * La lecture est PARTAGÉE (`ClientMandate`) ; un échec de lecture se dit —
 * montré comme « aucun mandat », il inviterait à en générer un second.
 */
@Component({
  selector: 'app-mandate-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MandateBlockers,
    CardFoot,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './mandate-mobile-card.html',
  styleUrl: './mandate-mobile-card.scss',
})
export class MandateMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly mandates = inject(ClientMandate);
  private readonly client = inject(ClientCompany);
  private readonly panels = inject(FoldPanelHostService);

  private readonly companyId = computed(() => this.client.company()?.id ?? null);
  private readonly stage = computed(() => mandateStage(this.mandates.mandate()));

  protected readonly state = computed(() => mandateStateLabel(this.stage(), this.t().account));
  protected readonly reference = computed(() =>
    mandateReferenceLabel(this.mandates.mandate(), this.t().account),
  );
  protected readonly printable = computed(() => mandatePrintable(this.mandates.mandate()));
  protected readonly detail = computed(() =>
    mandateDetailLabel(this.mandates.mandate(), this.t().account),
  );
  protected readonly action = computed(() => mandateActionLabel(this.stage(), this.t().account));
  /**
   * Pas sous un mandat actif : son papier signé porte déjà ces zones. Ni sous un
   * émetteur interentreprises : son mandat ne les imprime pas.
   */
  protected readonly editableOptions = computed(() =>
    mandateOptionsEditable(this.stage(), this.mandates.issuerScheme()),
  );

  protected readonly fetchFailed = signal(false);

  /**
   * Aucun mandat en cours, et une mention manque : « Générer mon mandat » reste
   * visible mais inerte, et la liste dit quoi compléter — le serveur refuserait.
   */
  protected readonly blocked = computed(
    () => this.stage() === 'none' && this.mandates.mintBlockers().length > 0,
  );

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (id !== null) {
        this.mandates.ensure(id);
      }
    });
  }

  protected retry(): void {
    const id = this.companyId();
    if (id !== null) {
      void this.mandates.reload(id);
    }
  }

  /**
   * Sans mandat en cours, le panneau s'ouvre en générant : un seul geste pour
   * « Générer mon mandat ». « Renvoyer le mandat signé » est une saisie, et
   * ouvre directement le dialogue de dépôt (règle « Saisir ») ; « Détails »
   * ouvre le panneau, où l'on remplace un scan déjà déposé.
   */
  protected open(): void {
    const id = this.companyId();
    if (id === null) {
      return;
    }
    if (this.stage() === 'awaiting') {
      MandateProofDialog.open(this.panels, id);
    } else {
      MandatePanel.open(this.panels, id, this.stage() === 'none');
    }
  }

  protected openOptions(): void {
    const id = this.companyId();
    if (id !== null) {
      MandateOptionsPanel.open(this.panels, id);
    }
  }

  protected async view(): Promise<void> {
    const id = this.companyId();
    if (id !== null) {
      this.fetchFailed.set(!(await openMandate(this.mandates, id)));
    }
  }

  protected async download(): Promise<void> {
    const id = this.companyId();
    const mandate = this.mandates.mandate();
    if (id !== null && mandate !== null) {
      this.fetchFailed.set(!(await downloadMandate(this.mandates, id, mandate.reference)));
    }
  }
}
