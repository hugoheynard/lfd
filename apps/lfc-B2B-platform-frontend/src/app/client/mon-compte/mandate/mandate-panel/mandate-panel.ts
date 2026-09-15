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
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { MandateBlockers } from '../mandate-blockers/mandate-blockers';
import { downloadMandate, openMandate } from '../mandate-document';
import { MandateProofDialog } from '../mandate-proof-dialog/mandate-proof-dialog';
import {
  mandateBody,
  mandateDetailLabel,
  mandateReferenceLabel,
  mandateStage,
  mandateStateLabel,
} from '../mandate-section';

/** Charge d'ouverture : la société, et s'il faut générer en ouvrant. */
export interface MandatePanelData {
  readonly companyId: string;
  /** Vrai quand la carte disait « Générer mon mandat » : le panneau génère aussitôt. */
  readonly generate: boolean;
}

/** Un refus du serveur, précédé de ce qu'il a empêché. */
interface Refusal {
  readonly lead: string;
  readonly message: string;
}

/**
 * Le panneau **Mandat SEPA** de `/mon-compte` : générer, voir et télécharger le
 * brouillon, lire la consigne — consulter, donc sur le côté (`panelSide()`).
 *
 * Déposer le scan signé est une saisie : depuis le 2026-09-15, ce n'est plus
 * ici mais dans `MandateProofDialog`, que le panneau empile par-dessus lui.
 *
 * Il lit la source partagée (`ClientMandate`) plutôt qu'une copie passée à
 * l'ouverture : générer, puis le dépôt fait dans le dialogue, font changer
 * l'état sous les yeux, et le panneau **reste ouvert** — l'étape suivante est
 * ici. Un refus de génération s'affiche tel quel, sous l'en-tête.
 *
 * Il n'active rien : activer autorise un débit, et reste le geste du commercial
 * qui a relu la pièce (plan §2).
 */
@Component({
  selector: 'app-mandate-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
    MandateBlockers,
  ],
  templateUrl: './mandate-panel.html',
  styleUrl: './mandate-panel.scss',
})
export class MandatePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  /** Ouvre le panneau depuis l'une ou l'autre carte ; `generate` quand aucun mandat n'est en cours. */
  static open(panels: FoldPanelHostService, companyId: string, generate: boolean): void {
    panels.open<MandatePanelData, void>(MandatePanel, {
      side: panelSide(),
      data: { companyId, generate },
    });
  }

  readonly data = input.required<MandatePanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly mandates = inject(ClientMandate);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly generating = signal(false);
  protected readonly refusal = signal<Refusal | null>(null);
  protected readonly fetchFailed = signal(false);

  protected readonly stage = computed(() => mandateStage(this.mandates.mandate()));
  protected readonly state = computed(() => mandateStateLabel(this.stage(), this.t().account));
  protected readonly reference = computed(() =>
    mandateReferenceLabel(this.mandates.mandate(), this.t().account),
  );
  protected readonly detail = computed(() =>
    mandateDetailLabel(this.mandates.mandate(), this.t().account),
  );

  /** Le texte détaillé de l'état — la carte n'en garde que la ligne. */
  protected readonly body = computed(() =>
    mandateBody(this.mandates.mandate(), this.mandates.issuerScheme(), this.t().account),
  );

  /** Le geste qui ouvre le dépôt : renvoyer le brouillon signé, ou remplacer le scan déposé. */
  protected readonly proofLabel = computed(() =>
    this.stage() === 'review' ? this.t().account.mandateDropReplace : this.t().account.mandateSend,
  );

  /** Les mentions qui manquent pour générer — vide quand la génération passerait. */
  protected readonly blockers = computed(() => this.mandates.mintBlockers());

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    // Sans génération possible (une mention manque), le panneau s'ouvre sur la
    // liste au lieu de partir vers un refus certain.
    effect(() => {
      if (this.data().generate) {
        untracked(() => {
          if (this.blockers().length === 0) {
            void this.generate();
          }
        });
      }
    });
  }

  protected async generate(): Promise<void> {
    if (this.generating() || this.blockers().length > 0) {
      return;
    }
    const companyId = this.data().companyId;
    this.generating.set(true);
    this.refusal.set(null);
    const refusal = await this.mandates.generate(companyId);
    this.generating.set(false);
    if (refusal !== null) {
      // Un refus malgré tout (`MandateMentionsMissingError`, 409, si une mention
      // a disparu entre-temps) : son message s'affiche, et la liste se relit.
      this.refusal.set({ lead: this.t().account.mandateGenerateFailed, message: refusal });
      await this.mandates.refresh(companyId);
    }
  }

  /** Empilé : le panneau reste dessous et montre l'état relu à la fermeture. */
  protected sendProof(): void {
    MandateProofDialog.open(this.panels, this.data().companyId, true);
  }

  protected async view(): Promise<void> {
    this.fetchFailed.set(!(await openMandate(this.mandates, this.data().companyId)));
  }

  protected async download(): Promise<void> {
    const mandate = this.mandates.mandate();
    if (mandate !== null) {
      this.fetchFailed.set(
        !(await downloadMandate(this.mandates, this.data().companyId, mandate.reference)),
      );
    }
  }
}
