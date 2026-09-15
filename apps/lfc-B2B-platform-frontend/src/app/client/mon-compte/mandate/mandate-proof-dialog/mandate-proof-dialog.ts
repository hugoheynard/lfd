import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate } from '../../../client-mandate.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { dialogSide } from '../../../panel-side';
import {
  mandateBody,
  mandateDetailLabel,
  mandateReferenceLabel,
  mandateStage,
} from '../mandate-section';

/**
 * Les formats que l'API reconnaît à leurs octets (`ScannedDocument`, vérifié le
 * 2026-09-14) : PDF, JPEG, PNG, HEIC. Le filtre du sélecteur ne protège rien —
 * il évite seulement de choisir un fichier qui sera refusé.
 */
const PROOF_ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic';

/** Charge d'ouverture : la société dont on renvoie le mandat. */
export interface MandateProofDialogData {
  readonly companyId: string;
}

/**
 * Le **dialogue « Renvoyer le mandat signé »** de `/mon-compte` : la consigne,
 * la zone de dépôt, et le remplacement d'un scan déjà déposé.
 *
 * Déposer est une saisie : dialogue centré au bureau, feuille du bas en pile
 * ({@link dialogSide}, règle « Saisir » du `CLAUDE.md` de l'app). La lecture du
 * mandat, elle, reste dans `MandatePanel`, sur le côté — consulter n'est pas
 * saisir.
 *
 * Il lit la source partagée (`ClientMandate`) : le schéma figé sur le brouillon
 * choisit la consigne, et le nom du fichier déjà déposé se dit avant qu'on le
 * remplace. Un refus reste affiché ici, dialogue ouvert ; un succès toaste et
 * ferme avec `true` — `attachProof` a déjà relu le mandat, et les cartes comme
 * le panneau le lisent au même endroit.
 */
@Component({
  selector: 'app-mandate-proof-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFileDropzoneComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mandate-proof-dialog.html',
  styleUrl: './mandate-proof-dialog.scss',
})
export class MandateProofDialog {
  /** `md` (490 px) : une consigne et une zone de dépôt, comme les autres saisies (échelle `FoldPanelSize`). */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre le dialogue. `stack` depuis `MandatePanel` : le panneau reste dessous,
   * et montre l'état relu quand le dialogue se ferme.
   */
  static open(
    panels: FoldPanelHostService,
    companyId: string,
    stack = false,
  ): FoldPanelRef<boolean> {
    return panels.open<MandateProofDialogData, boolean>(MandateProofDialog, {
      side: dialogSide(),
      stack,
      data: { companyId },
    });
  }

  readonly data = input.required<MandateProofDialogData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly mandates = inject(ClientMandate);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly uploading = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly stage = computed(() => mandateStage(this.mandates.mandate()));
  protected readonly reference = computed(() =>
    mandateReferenceLabel(this.mandates.mandate(), this.t().account),
  );
  /** « Fichier déposé : … » quand un scan attend déjà : on sait ce qu'on remplace. */
  protected readonly detail = computed(() =>
    mandateDetailLabel(this.mandates.mandate(), this.t().account),
  );
  /** La consigne « daté et signé », selon le schéma du papier ; ou la vérification en cours. */
  protected readonly body = computed(() =>
    mandateBody(this.mandates.mandate(), this.mandates.issuerScheme(), this.t().account),
  );
  protected readonly dropLabel = computed(() =>
    this.stage() === 'review' ? this.t().account.mandateDropReplace : this.t().account.mandateDrop,
  );

  protected readonly accept = PROOF_ACCEPT;

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
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }
}
