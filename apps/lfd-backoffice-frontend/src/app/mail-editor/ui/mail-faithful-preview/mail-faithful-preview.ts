import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { httpErrorMessage } from '@lfd/endpoints';
import type { MailDocument, MailDocumentPreviewView, MailLocale } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { MailEditorService } from '../../data/mail-editor.service';

/** Ce qu'un aperçu a rendu : le document et la langue de la demande. */
interface RenderedFor {
  readonly document: MailDocument;
  readonly locale: MailLocale;
}

/**
 * **L'aperçu fidèle** (§ 6) : le rendu du serveur — ce qui partirait, avec
 * des données d'exemple et les phrases en brouillon — du document à l'écran,
 * dans la langue choisie. **À la demande seulement** : un bouton, jamais à
 * chaque frappe ; quand l'écran a bougé depuis, l'aperçu le dit au lieu de se
 * relancer.
 *
 * Le HTML est posé dans un cadre au `sandbox` VIDE : ni script, ni même
 * origine, ni formulaire, ni navigation — il reste inerte. Lecture seule.
 */
@Component({
  selector: 'app-mail-faithful-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './mail-faithful-preview.html',
  styleUrl: './mail-faithful-preview.scss',
})
export class MailFaithfulPreview {
  readonly template = input.required<string>();
  readonly locale = input.required<MailLocale>();
  readonly document = input.required<MailDocument>();

  private readonly api = inject(MailEditorService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly status = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<MailDocumentPreviewView | null>(null);
  private readonly renderedFor = signal<RenderedFor | null>(null);

  /** Le HTML du serveur, posé tel quel : le cadre est sandboxé sans aucun drapeau. */
  protected readonly body = computed<SafeHtml | null>(() => {
    const preview = this.preview();
    return preview === null ? null : this.sanitizer.bypassSecurityTrustHtml(preview.html);
  });

  protected readonly attachments = computed(() =>
    (this.preview()?.attachments ?? []).filter((attachment) => !attachment.inline),
  );

  /** L'écran a changé depuis le dernier aperçu : document ou langue. */
  readonly stale = computed(() => {
    const rendered = this.renderedFor();
    return (
      rendered !== null &&
      (rendered.document !== this.document() || rendered.locale !== this.locale())
    );
  });

  private request = 0;

  /** Seule la dernière demande s'affiche : un aperçu lent ne recouvre pas le suivant. */
  async render(): Promise<void> {
    const request = ++this.request;
    const asked: RenderedFor = { document: this.document(), locale: this.locale() };
    if (this.preview() === null) {
      this.status.set('loading');
    }
    try {
      const preview = await this.api.preview(this.template(), {
        locale: asked.locale,
        source: 'draft',
        document: asked.document,
      });
      if (request === this.request) {
        this.preview.set(preview);
        this.renderedFor.set(asked);
        this.error.set(null);
        this.status.set('ready');
      }
    } catch (error) {
      if (request === this.request) {
        this.error.set(httpErrorMessage(error, 'L’aperçu n’a pas pu être rendu.'));
        this.status.set(this.preview() === null ? 'failed' : 'ready');
      }
    }
  }
}
