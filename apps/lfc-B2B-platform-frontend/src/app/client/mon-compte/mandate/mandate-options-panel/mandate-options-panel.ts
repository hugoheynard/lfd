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
  EMPTY_MANDATE_OPTIONS_DRAFT,
  MandateOptionsForm,
  mandateOptionsDraftChanged,
  mandateOptionsDraftFrom,
  toMandateOptionsPayload,
  type MandateOptionsDraft,
} from '@lfd/b2b-ui/payment';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
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
import { dialogSide } from '../../../panel-side';
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
 * Les deux champs sont `lfd-mandate-options-form` de `@lfd/b2b-ui/payment`, le
 * même formulaire que la fiche staff (depuis le 2026-09-14).
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
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    MandateOptionsForm,
  ],
  templateUrl: './mandate-options-panel.html',
  styleUrl: './mandate-options-panel.scss',
})
export class MandateOptionsPanel {
  /**
   * Une SAISIE : dialogue centré au bureau, feuille du bas en pile
   * (`dialogSide()`, règle « Saisir » du `CLAUDE.md` de l'app, 2026-09-14). `md`
   * (490 px) : deux zones et un avertissement (échelle `FoldPanelSize`). Le nom
   * `*-panel` est d'avant cette règle.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, companyId: string): void {
    panels.open<MandateOptionsPanelData, boolean>(MandateOptionsPanel, {
      side: dialogSide(),
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

  protected readonly draft = signal<MandateOptionsDraft>(EMPTY_MANDATE_OPTIONS_DRAFT);

  /** Un brouillon — scanné ou non — deviendrait caduc à l'enregistrement. */
  protected readonly voidsDraft = computed(() => {
    const stage = mandateStage(this.mandates.mandate());
    return stage === 'awaiting' || stage === 'review';
  });

  /**
   * Les zones relues, prêtes, ET une modification (règle « Saisir ») : réécrire
   * les mêmes zones révoquerait un brouillon pour rien.
   */
  protected readonly canSave = computed(() => {
    const options = this.mandates.options();
    return (
      !this.saving() &&
      this.mandates.optionsStatus() === 'ready' &&
      options !== null &&
      mandateOptionsDraftChanged(this.draft(), options)
    );
  });

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const companyId = this.data().companyId;
      untracked(() => void this.mandates.loadOptions(companyId));
    });
    // Le pré-remplissage suit la lecture : elle arrive après l'ouverture.
    effect(() => {
      const options = this.mandates.options();
      untracked(() =>
        this.draft.set(
          options === null ? EMPTY_MANDATE_OPTIONS_DRAFT : mandateOptionsDraftFrom(options),
        ),
      );
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
    const refusal = await this.mandates.saveOptions(
      this.data().companyId,
      toMandateOptionsPayload(this.draft()),
    );
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
}
