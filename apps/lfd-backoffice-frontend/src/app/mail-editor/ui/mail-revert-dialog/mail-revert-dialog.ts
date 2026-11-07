import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
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

/** Ce que la page confie à la fenêtre : ce qui sera effacé, et le geste. */
export interface MailRevertDialogData {
  /** Les phrases qui disent ce qui est effacé, une par ligne. */
  readonly erased: readonly string[];
  /** Revient ; rend le refus du serveur tel quel, ou `null` si c'est fait. */
  readonly revert: () => Promise<string | null>;
}

/**
 * **« Revenir au modèle d'origine »** : dit ce qui est effacé avant de le
 * faire. Un refus reste dans la fenêtre ; un succès la ferme sur `true`.
 */
@Component({
  selector: 'app-mail-revert-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mail-revert-dialog.html',
  styleUrl: './mail-revert-dialog.scss',
})
export class MailRevertDialog implements FoldPanelContent<MailRevertDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<MailRevertDialogData>();
  private readonly panel = inject(FoldPanelRef<boolean>);

  protected readonly reverting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm(): Promise<void> {
    if (this.reverting()) {
      return;
    }
    this.reverting.set(true);
    this.error.set(null);
    try {
      const refusal = await this.data().revert();
      if (refusal === null) {
        this.panel.close(true);
      } else {
        this.error.set(refusal);
      }
    } finally {
      this.reverting.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
