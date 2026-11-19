import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

/**
 * Ce que le dialogue enregistre. `save` écrit le modèle sous le nom saisi et
 * rend le refus du serveur à afficher, ou `null` s'il est écrit : un refus
 * (nom déjà pris…) reste dans le dialogue, qui reste ouvert.
 */
export interface TemplateNameDialogData {
  /** Ce qui part dans le modèle : « Pour demain · 4 article(s) ». */
  readonly summary: string;
  readonly initialName: string;
  readonly save: (name: string) => Promise<string | null>;
}

/**
 * **« Enregistrer comme modèle »** — le nom du modèle, demandé au comptoir
 * (plan `plan-modeles-de-reassort.md`, § 4). Rend le nom enregistré, rien si
 * l'on ferme.
 */
@Component({
  selector: 'app-template-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './template-name-dialog.html',
  styleUrl: './template-name-dialog.scss',
})
export class TemplateNameDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm', surface: 'solid' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);
  readonly data = input.required<TemplateNameDialogData>();

  protected readonly name = linkedSignal(() => this.data().initialName);
  protected readonly pending = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly canSave = computed(() => this.name().trim() !== '' && !this.pending());

  protected async submit(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const name = this.name().trim();
    this.pending.set(true);
    this.refusal.set(null);
    try {
      const refusal = await this.data().save(name);
      if (refusal === null) {
        this.ref.close(name);
      } else {
        this.refusal.set(refusal);
      }
    } finally {
      this.pending.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
