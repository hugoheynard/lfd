import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  MailCharterPreviewView,
  MailCharterSettings,
  MailLocale,
  MailSpace,
} from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { mailLabel } from '../../rules/mail-labels';
import { MailChartersService } from '../../data/mail-charters.service';

/** Ce qu'un aperçu a rendu : la charte, la langue et l'e-mail de la demande. */
interface RenderedFor {
  readonly settings: MailCharterSettings;
  readonly locale: MailLocale;
  readonly template: string | null;
}

/** Le thème que le cadre annonce au message (`color-scheme`). */
export type CharterPreviewScheme = 'light' | 'dark';

const SCHEME_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

/**
 * **L'aperçu de la charte** (§ 25, C2) : un e-mail de l'espace, rendu par le
 * serveur avec la charte À L'ÉCRAN — même non enregistrée. À la demande
 * seulement, comme l'aperçu fidèle d'un e-mail ; quand la charte, la langue
 * ou l'e-mail ont bougé depuis, l'aperçu le dit.
 *
 * Le HTML est posé dans un cadre au `sandbox` VIDE : inerte. « Clair /
 * sombre » pose son `color-scheme`, que le message lit par
 * `prefers-color-scheme`, sans redemander le rendu.
 */
@Component({
  selector: 'app-mail-charter-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './mail-charter-preview.html',
  styleUrl: './mail-charter-preview.scss',
})
export class MailCharterPreview {
  readonly space = input.required<MailSpace>();
  readonly locale = input.required<MailLocale>();
  readonly settings = input.required<MailCharterSettings>();
  /** Les e-mails de l'espace (`MailCharterView.templates`). */
  readonly templates = input.required<readonly string[]>();

  private readonly api = inject(MailChartersService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly status = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<MailCharterPreviewView | null>(null);
  private readonly renderedFor = signal<RenderedFor | null>(null);

  /** L'e-mail choisi ; `null` : le premier de l'espace, celui que le serveur prend. */
  readonly template = signal<string | null>(null);
  readonly scheme = signal<CharterPreviewScheme>('light');
  protected readonly schemeOptions = SCHEME_OPTIONS;
  protected readonly templateOptions = computed(() =>
    this.templates().map((template) => ({ value: template, label: mailLabel(template).title })),
  );

  protected setScheme(value: string): void {
    this.scheme.set(value === 'dark' ? 'dark' : 'light');
  }

  protected setTemplate(template: string): void {
    this.template.set(template);
  }

  protected readonly body = computed<SafeHtml | null>(() => {
    const preview = this.preview();
    return preview === null ? null : this.sanitizer.bypassSecurityTrustHtml(preview.html);
  });

  /** La charte, la langue ou l'e-mail ont changé depuis le dernier aperçu. */
  readonly stale = computed(() => {
    const rendered = this.renderedFor();
    return (
      rendered !== null &&
      (rendered.settings !== this.settings() ||
        rendered.locale !== this.locale() ||
        rendered.template !== this.template())
    );
  });

  private request = 0;

  /** Seule la dernière demande s'affiche : un aperçu lent ne recouvre pas le suivant. */
  async render(): Promise<void> {
    const request = ++this.request;
    const asked: RenderedFor = {
      settings: this.settings(),
      locale: this.locale(),
      template: this.template(),
    };
    if (this.preview() === null) {
      this.status.set('loading');
    }
    try {
      const preview = await this.api.preview(this.space(), {
        locale: asked.locale,
        settings: asked.settings,
        ...(asked.template === null ? {} : { template: asked.template }),
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
