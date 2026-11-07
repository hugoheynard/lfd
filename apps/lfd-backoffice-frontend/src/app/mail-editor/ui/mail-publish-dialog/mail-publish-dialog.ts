import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type Signal,
} from '@angular/core';
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

/** Ce que la page confie à la fenêtre de publication — lu en direct, pas figé à l'ouverture. */
export interface MailPublishDialogData {
  /** « les clients », « l’équipe »… */
  readonly recipients: string;
  /** Les refus de publication du document à l'écran (`validateMailDocumentForPublication`). */
  readonly issues: Signal<readonly string[]>;
  /** Les phrases en brouillon qui partiront avec. */
  readonly pendingPhrases: Signal<number>;
  /** Le brouillon du document a été refusé à l'enregistrement : rien ne se publie. */
  readonly saveRefusal: Signal<string | null>;
  /** Publie ; rend le refus du serveur tel quel, ou `null` si c'est fait. */
  readonly publish: () => Promise<string | null>;
}

/**
 * **« Publier » un e-mail** (plan `plan-editeur-par-blocs.md`, retouche de
 * l'en-tête du 2026-11-07) : ce qui part et à qui, les phrases qui partent
 * avec, et — s'il y en a — les refus qui l'empêchent, bouton désactivé.
 * Un refus du serveur reste dans la fenêtre ; un succès la ferme sur `true`.
 */
@Component({
  selector: 'app-mail-publish-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mail-publish-dialog.html',
  styleUrl: './mail-publish-dialog.scss',
})
export class MailPublishDialog implements FoldPanelContent<MailPublishDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<MailPublishDialogData>();
  private readonly panel = inject(FoldPanelRef<boolean>);

  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly issues = computed(() => this.data().issues());
  protected readonly saveRefusal = computed(() => this.data().saveRefusal());
  protected readonly pending = computed(() => this.data().pendingPhrases());
  protected readonly blocked = computed(
    () => this.issues().length > 0 || this.saveRefusal() !== null,
  );

  protected readonly message = computed(
    () =>
      `Dès le prochain envoi, ${this.data().recipients} recevront cet e-mail tel qu’il est à l’écran.`,
  );

  protected readonly pendingMessage = computed(() => {
    const count = this.pending();
    if (count === 0) {
      return 'Aucune phrase en attente : les phrases restent celles d’aujourd’hui.';
    }
    return count === 1
      ? '1 phrase en brouillon part avec cette publication.'
      : `${count} phrases en brouillon partent avec cette publication.`;
  });

  protected async confirm(): Promise<void> {
    if (this.blocked() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    try {
      const refusal = await this.data().publish();
      if (refusal === null) {
        this.panel.close(true);
      } else {
        this.error.set(refusal);
      }
    } finally {
      this.publishing.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
