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
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';
import { downloadMandate, openMandate } from '../mandate-document';
import {
  mandateDetailLabel,
  mandateReferenceLabel,
  mandateStage,
  mandateStateLabel,
} from '../mandate-section';

/**
 * Les formats que l'API reconnaît à leurs octets (`ScannedDocument`, vérifié le
 * 2026-09-14) : PDF, JPEG, PNG, HEIC. Le filtre du sélecteur ne protège rien —
 * il évite seulement de choisir un fichier qui sera refusé.
 */
const PROOF_ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic';

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
 * brouillon, lire la consigne, déposer le scan signé.
 *
 * Il lit la source partagée (`ClientMandate`) plutôt qu'une copie passée à
 * l'ouverture : générer puis déposer font changer l'état sous les yeux, et le
 * panneau **reste ouvert** — l'étape suivante est ici. Un refus du serveur
 * s'affiche tel quel, sous l'en-tête.
 *
 * Il n'active rien : activer autorise un débit, et reste le geste du commercial
 * qui a relu la pièce (plan §2).
 */
@Component({
  selector: 'app-mandate-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFileDropzoneComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
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
  private readonly notify = inject(NotifyService);

  protected readonly generating = signal(false);
  protected readonly uploading = signal(false);
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
  protected readonly body = computed(() => {
    const copy = this.t().account;
    switch (this.stage()) {
      case 'none':
        return copy.mandateNoneBody;
      case 'awaiting':
        return copy.mandateAwaitingBody;
      case 'review':
        return copy.mandateInReviewBody;
      case 'active':
        return copy.mandateActiveBody;
    }
  });

  protected readonly dropLabel = computed(() =>
    this.stage() === 'review' ? this.t().account.mandateDropReplace : this.t().account.mandateDrop,
  );

  protected readonly accept = PROOF_ACCEPT;

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      if (this.data().generate) {
        untracked(() => void this.generate());
      }
    });
  }

  protected async generate(): Promise<void> {
    if (this.generating()) {
      return;
    }
    this.generating.set(true);
    this.refusal.set(null);
    const refusal = await this.mandates.generate(this.data().companyId);
    this.generating.set(false);
    if (refusal !== null) {
      this.refusal.set({ lead: this.t().account.mandateGenerateFailed, message: refusal });
    }
  }

  protected async upload(files: readonly File[]): Promise<void> {
    const [file] = files;
    if (file === undefined || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.refusal.set(null);
    const refusal = await this.mandates.attachProof(this.data().companyId, file);
    this.uploading.set(false);
    if (refusal === null) {
      this.notify.success(this.t().account.mandateUploadedToast);
    } else {
      this.refusal.set({ lead: this.t().account.mandateUploadFailed, message: refusal });
    }
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
