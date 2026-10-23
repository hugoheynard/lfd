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
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type {
  ContentLocale,
  MailCopyMailView,
  MailCopyPreviewView,
  MailCopySource,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { COPY_LOCALES, LOCALE_LABELS } from '../../../textes-boutique/rules/copy-text';
import { MailCopyService } from '../../data/mail-copy.service';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';

const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = COPY_LOCALES.map((locale) => ({
  value: locale,
  label: locale.toUpperCase(),
  ariaLabel: LOCALE_LABELS[locale],
}));

const SOURCE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publié' },
];

function isLocale(value: string): value is ContentLocale {
  return (COPY_LOCALES as readonly string[]).includes(value);
}

function isSource(value: string): value is MailCopySource {
  return value === 'draft' || value === 'published';
}

/**
 * **L'aperçu d'un e-mail** (C6) : son vrai gabarit, rendu par le serveur
 * avec des données d'exemple — l'objet, puis le corps dans un cadre isolé
 * (`srcdoc`, `sandbox` vide : ni script, ni même origine). La langue et la
 * source — les brouillons, ou ce qui part aujourd'hui — se choisissent ;
 * l'aperçu des brouillons se relit à chaque écriture acceptée.
 *
 * « M'envoyer un essai » envoie ce même aperçu à l'adresse de la fiche du
 * staff connecté, et à elle seule (droit `:write`, comme côté serveur).
 */
@Component({
  selector: 'app-mail-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './mail-preview.html',
  styleUrl: './mail-preview.scss',
})
export class MailPreview {
  readonly mail = input.required<MailCopyMailView>();

  protected readonly store = inject(MailCopyStore);
  private readonly writer = inject(MailDraftWriter);
  private readonly api = inject(MailCopyService);
  private readonly notify = inject(NotifyService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;

  readonly locale = signal<ContentLocale>('fr');
  readonly source = signal<MailCopySource>('draft');

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<MailCopyPreviewView | null>(null);
  protected readonly sending = signal(false);

  /** Le HTML du serveur, posé tel quel : le cadre est sandboxé, rien ne s'y exécute. */
  protected readonly body = computed<SafeHtml | null>(() => {
    const preview = this.preview();
    return preview === null ? null : this.sanitizer.bypassSecurityTrustHtml(preview.html);
  });

  protected readonly attachments = computed(() =>
    (this.preview()?.attachments ?? []).filter((attachment) => !attachment.inline),
  );

  /** Un e-mail qui part toujours en français : son aperçu étranger montre le français. */
  protected readonly alwaysFrench = computed(() => !this.mail().followsLocale);

  private request = 0;

  constructor() {
    effect(() => {
      const mail = this.mail().mail;
      const locale = this.locale();
      const source = this.source();
      if (source === 'draft') {
        this.store.drafts();
      }
      untracked(() => void this.load(mail, locale, source));
    });
  }

  protected setLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
    }
  }

  protected setSource(value: string): void {
    if (isSource(value)) {
      this.source.set(value);
    }
  }

  protected reload(): void {
    void this.load(this.mail().mail, this.locale(), this.source());
  }

  /** Envoie d'abord la frappe en attente : l'essai montre ce qu'on voit. */
  protected async sendTrial(): Promise<void> {
    if (!this.store.canWrite() || this.sending()) {
      return;
    }
    this.sending.set(true);
    try {
      await this.writer.flush();
      await this.api.sendTrial(this.mail().mail, this.locale(), this.source());
      this.notify.success('Essai envoyé à votre adresse.');
    } catch (error) {
      this.notify.error(error, 'L’essai n’a pas pu partir.');
    } finally {
      this.sending.set(false);
    }
  }

  /** Seule la dernière demande s'affiche : un aperçu lent ne recouvre pas le suivant. */
  private async load(mail: string, locale: ContentLocale, source: MailCopySource): Promise<void> {
    const request = ++this.request;
    if (this.preview() === null) {
      this.status.set('loading');
    }
    try {
      const preview = await this.api.preview(mail, locale, source);
      if (request === this.request) {
        this.preview.set(preview);
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
