import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { DriverNoticeView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { DriverNoticeService } from '../driver-notice.service';
import { DriverNoticeText } from '../driver-notice-text/driver-notice-text';

export interface DriverNoticeDialogData {
  readonly notice: DriverNoticeView;
}

/**
 * **Avant de démarrer** — le texte d'information du livreur, en entier
 * (`documentation/legal/rgpd-livreur.md`, §7 point 2). Une information, pas un
 * consentement : il n'y a rien à refuser, seulement « plus tard ».
 *
 * « J'ai compris » écrit l'accusé PUIS ferme sur `true` : la page démarre la
 * tournée. « Plus tard » (ou la croix) ferme sans rien écrire : la tournée ne
 * démarre pas, et le dialogue reviendra au prochain appui. Un refus du serveur
 * reste affiché, dialogue ouvert.
 */
@Component({
  selector: 'app-driver-notice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DriverNoticeText,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './driver-notice-dialog.html',
})
export class DriverNoticeDialog implements FoldPanelContent<DriverNoticeDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<DriverNoticeDialogData>();

  private readonly api = inject(DriverNoticeService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected async understood(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.acknowledge(this.data().notice.version);
      this.panel.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Votre lecture n’a pas pu être enregistrée.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected later(): void {
    this.panel.close(false);
  }
}
