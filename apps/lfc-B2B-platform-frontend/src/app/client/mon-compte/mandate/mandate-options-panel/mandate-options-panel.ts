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
import type { SetMandateOptionsPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { mandateStage } from '../mandate-section';

/** Charge d'ouverture : la société, rien d'autre — les zones se relisent à l'ouverture. */
export interface MandateOptionsPanelData {
  readonly companyId: string;
}

/**
 * Le panneau des **options du mandat** — les zones facultatives 14 (code
 * débiteur) et 19 (numéro de contrat), que le client règle lui-même depuis le
 * 2026-09-14 (plan `plan-mandat-client.md` §10).
 *
 * Les zones sont **relues à l'ouverture** plutôt que passées par la carte : la
 * carte ne les montre pas, et un réglage rare ne mérite pas une lecture à
 * chaque chargement de `/mon-compte`.
 *
 * 🔴 Ces zones sont imprimées sur le papier : tant qu'un brouillon existe, les
 * réécrire le rend caduc côté serveur, et le panneau le dit AVANT
 * l'enregistrement. Sous un mandat actif, la carte ne propose pas le geste.
 *
 * Un refus reste affiché ici ; un succès relit le mandat et les options, puis
 * ferme le panneau.
 */
@Component({
  selector: 'app-mandate-options-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mandate-options-panel.html',
  styleUrl: './mandate-options-panel.scss',
})
export class MandateOptionsPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, companyId: string): void {
    panels.open<MandateOptionsPanelData, boolean>(MandateOptionsPanel, {
      side: panelSide(),
      data: { companyId },
    });
  }

  readonly data = input.required<MandateOptionsPanelData>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly mandates = inject(ClientMandate);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly debtorReferenceDraft = signal('');
  protected readonly contractNumberDraft = signal('');

  /** Un brouillon — scanné ou non — deviendrait caduc à l'enregistrement. */
  protected readonly voidsDraft = computed(() => {
    const stage = mandateStage(this.mandates.mandate());
    return stage === 'awaiting' || stage === 'review';
  });

  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.mandates.optionsStatus() === 'ready' &&
      this.mandates.options() !== null,
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const companyId = this.data().companyId;
      untracked(() => void this.mandates.loadOptions(companyId));
    });
    // Le pré-remplissage suit la lecture : elle arrive après l'ouverture.
    effect(() => {
      const options = this.mandates.options();
      untracked(() => {
        this.debtorReferenceDraft.set(options?.debtorReference ?? '');
        this.contractNumberDraft.set(options?.contractNumber ?? '');
      });
    });
  }

  protected retry(): void {
    void this.mandates.loadOptions(this.data().companyId);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.mandates.saveOptions(this.data().companyId, this.payload());
    this.saving.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.mandateOptionsSavedToast);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  private payload(): SetMandateOptionsPayload {
    return {
      debtorReference: this.debtorReferenceDraft().trim(),
      contractNumber: this.contractNumberDraft().trim(),
    };
  }
}
