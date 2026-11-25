import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';

import { GestureIntents } from '../../../shared/gesture-intents';
import { serverMessageOf } from '../../server-message';
import { WorksheetService } from '../../worksheet.service';

/** Ce que le panneau reçoit : la journée LUE, la ligne, et le poste dont c'est l'étape. */
export interface StepRedPanelData {
  readonly date: string;
  readonly line: WorkshopLine;
  readonly workstationId: string;
}

/**
 * **Le rouge d'une étape** (`fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.3) : un poste qui ne finit pas la ligne met sa part en rouge, une
 * raison si on veut. Aucune quantité ni plafond — l'étape ne compte aucune
 * pièce ; la Supervision la montre parmi les problèmes, marquée « étape ».
 *
 * Il envoie lui-même, sous la clé d'une {@link GestureIntents} tenue par
 * raison : un double appui rejoue la même intention. Un refus reste dans le
 * panneau ; un succès le ferme sur `true`, et la fiche relit.
 */
@Component({
  selector: 'app-workshop-step-red-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './workshop-step-red-panel.html',
  styleUrl: './workshop-step-red-panel.scss',
})
export class WorkshopStepRedPanel implements FoldPanelContent<StepRedPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<StepRedPanelData>();

  private readonly panel = inject(FoldPanelRef<boolean>);
  private readonly api = inject(WorksheetService);
  private readonly intents = new GestureIntents();

  protected readonly reason = signal('');
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected close(): void {
    this.panel.close();
  }

  protected async submit(): Promise<void> {
    if (this.sending()) {
      return;
    }
    const { date, line, workstationId } = this.data();
    const reason = this.reason().trim();
    const subject = `step-red|${date}|${line.sku}|${workstationId}|${reason}`;
    this.sending.set(true);
    this.refusal.set(null);
    try {
      await this.api.markStepRed(
        date,
        line.sku,
        workstationId,
        reason === '' ? {} : { reason },
        this.intents.keyFor(subject),
      );
    } catch (error) {
      this.refusal.set(
        error instanceof HttpErrorResponse && error.status === 0
          ? 'Le serveur n’a pas répondu — renvoyez : le même rouge ne comptera pas deux fois.'
          : serverMessageOf(error),
      );
      this.sending.set(false);
      return;
    }
    this.intents.done(subject);
    this.panel.close(true);
  }
}
