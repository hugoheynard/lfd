import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { MailLocale } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { MailPhraseSource } from '../mail-faithful-preview/mail-faithful-preview';

/** Ce qui part à l'essai. */
export interface MailTrialChoice {
  readonly locale: MailLocale;
  readonly caseId: string | null;
  readonly source: MailPhraseSource;
}

/** Ce que la page confie à la fenêtre d'essai : ses choix courants, et le geste. */
export interface MailTrialDialogData extends MailTrialChoice {
  readonly locales: readonly { readonly value: MailLocale; readonly label: string }[];
  readonly cases: readonly { readonly value: string; readonly label: string }[];
  /** Envoie ; rend le refus du serveur tel quel, ou `null` si c'est parti. */
  readonly send: (choice: MailTrialChoice) => Promise<string | null>;
}

const SOURCE_OPTIONS: readonly { readonly value: MailPhraseSource; readonly label: string }[] = [
  { value: 'draft', label: 'Phrases en brouillon' },
  { value: 'published', label: 'Phrases publiées' },
];

/**
 * **« M'envoyer un essai »** : la langue, le cas et les phrases, repris de
 * la page et modifiables ici ; l'essai part à l'adresse de l'auteur seul.
 * La clé d'intention reste celle de la page (une par choix, gardée jusqu'à
 * l'envoi). Un refus reste dans la fenêtre ; un envoi la ferme sur `true`.
 */
@Component({
  selector: 'app-mail-trial-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mail-trial-dialog.html',
  styleUrl: './mail-trial-dialog.scss',
})
export class MailTrialDialog implements FoldPanelContent<MailTrialDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<MailTrialDialogData>();
  private readonly panel = inject(FoldPanelRef<boolean>);

  protected readonly sourceOptions = SOURCE_OPTIONS;
  readonly locale = linkedSignal(() => this.data().locale);
  readonly caseId = linkedSignal(() => this.data().caseId);
  readonly source = linkedSignal(() => this.data().source);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sourceNote = computed(() =>
    this.source() === 'draft'
      ? 'Les phrases telles qu’elles s’écrivent, avant publication.'
      : 'Les phrases qui partent aujourd’hui aux clients.',
  );

  protected async confirm(): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      const refusal = await this.data().send({
        locale: this.locale(),
        caseId: this.caseId(),
        source: this.source(),
      });
      if (refusal === null) {
        this.panel.close(true);
      } else {
        this.error.set(refusal);
      }
    } finally {
      this.sending.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
