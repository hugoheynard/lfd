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
import { httpErrorMessage } from '@lfd/endpoints';
import type { MailDocument, MailEditorView, MailLocale } from '@lfd/mail-blocks';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { mailLabel, mailWhoAndWhen } from '../../../textes-emails/rules/mail-labels';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailCanvas } from '../mail-canvas/mail-canvas';
import { MailFaithfulPreview } from '../mail-faithful-preview/mail-faithful-preview';

/** D'où vient le document ouvert, dit à l'équipe. */
const SOURCE_LABELS: Readonly<Record<MailEditorView['source'], string>> = {
  draft: 'Brouillon en cours',
  published: 'Version publiée',
  starting: 'Arrangement d’origine',
};

/**
 * **La page d'un e-mail** (§ 6, S5a) : le canevas (S5b) monté avec le
 * document que l'éditeur ouvre — le brouillon, sinon le publié, sinon le
 * document de départ — et la déclaration du modèle ; la langue au-dessus,
 * parmi celles du modèle ; l'aperçu fidèle à la demande.
 *
 * « Enregistrer le brouillon » (droit `mail_templates:write`) envoie le
 * document avec la révision lue, puis relit : un `409` dit que quelqu'un a
 * écrit entre-temps, et le document à l'écran est gardé. Rien ne part chez un
 * client : publier est S5c.
 */
@Component({
  selector: 'app-mail-template-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    MailCanvas,
    MailFaithfulPreview,
  ],
  templateUrl: './mail-template-page.html',
  styleUrl: './mail-template-page.scss',
})
export class MailTemplatePage {
  /** Le segment de route `:template` (`withComponentInputBinding`). */
  readonly template = input.required<string>();

  private readonly api = inject(MailEditorService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<MailEditorView | null>(null);
  /** Le document à l'écran : celui du serveur, puis chaque geste du canevas. */
  readonly document = signal<MailDocument | null>(null);
  readonly locale = signal<MailLocale>('fr');
  protected readonly saving = signal(false);

  protected readonly canWrite = computed(() => this.permissions.can('mail_templates:write'));
  protected readonly title = computed(() => mailLabel(this.template()).title);
  protected readonly whoAndWhen = computed(() => mailWhoAndWhen(this.template()));
  protected readonly sourceLabel = computed(() => {
    const view = this.view();
    return view === null ? '' : SOURCE_LABELS[view.source];
  });

  /** Les langues du modèle, et elles seules : un e-mail en français seul n'en montre qu'une. */
  protected readonly localeOptions = computed<readonly FoldViewToggleOption[]>(() =>
    (this.view()?.declaration.locales ?? []).map((locale) => ({
      value: locale,
      label: locale.toUpperCase(),
      ariaLabel: LOCALE_LABELS[locale],
    })),
  );

  /** Le document diffère de celui que le serveur a rendu. */
  readonly dirty = computed(() => {
    const view = this.view();
    return view !== null && this.document() !== view.document;
  });

  constructor() {
    effect(() => {
      const template = this.template();
      untracked(() => void this.load(template));
    });
  }

  protected async load(template: string = this.template()): Promise<void> {
    this.status.set('loading');
    try {
      this.apply(await this.api.load(template));
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'Cet e-mail n’a pas pu être lu.'));
      this.status.set('failed');
    }
  }

  protected setLocale(value: string): void {
    const locale = this.view()?.declaration.locales.find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.locale.set(locale);
    }
  }

  async save(): Promise<void> {
    const view = this.view();
    const document = this.document();
    if (view === null || document === null || !this.canWrite() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.api.saveDraft(view.template, { document, expectedRevision: view.revision });
      this.apply(await this.api.load(view.template));
      this.notify.success('Brouillon enregistré.');
    } catch (error) {
      this.notify.error(error, 'Le brouillon n’a pas pu être enregistré.');
    } finally {
      this.saving.set(false);
    }
  }

  /** Pose la vue lue ; garde la langue choisie si le modèle la parle encore. */
  private apply(view: MailEditorView): void {
    this.view.set(view);
    this.document.set(view.document);
    this.error.set(null);
    const locales = view.declaration.locales;
    if (!locales.includes(this.locale())) {
      const first = locales[0];
      if (first !== undefined) {
        this.locale.set(first);
      }
    }
  }
}
