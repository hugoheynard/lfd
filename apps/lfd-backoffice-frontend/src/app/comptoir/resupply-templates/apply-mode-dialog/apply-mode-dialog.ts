import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { ResupplyTemplateApplyMode } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

/** Le modèle qu'on applique, et ce que compte déjà la composition. */
export interface ApplyModeDialogData {
  readonly templateName: string;
  readonly lineCount: number;
}

/**
 * **Remplacer ou ajouter ?** — la question posée quand on applique un modèle
 * à une composition qui a déjà des lignes (plan `plan-modeles-de-reassort.md`,
 * M5). « Remplacer » pose le modèle et retire le reste ; « Ajouter »
 * additionne ses quantités. Rend le mode choisi, rien si l'on ferme.
 * Le comptoir et le fournil posent la même question.
 */
@Component({
  selector: 'app-apply-mode-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './apply-mode-dialog.html',
})
export class ApplyModeDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm', surface: 'solid' };

  private readonly ref = inject<FoldPanelRef<ResupplyTemplateApplyMode>>(FoldPanelRef);
  readonly data = input.required<ApplyModeDialogData>();

  protected choose(mode: ResupplyTemplateApplyMode): void {
    this.ref.close(mode);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
