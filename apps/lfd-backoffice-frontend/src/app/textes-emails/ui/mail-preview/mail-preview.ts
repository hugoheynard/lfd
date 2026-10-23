import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
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
import { locateInPreview } from '../../rules/mail-sections';
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

/** L'attribut posé sur la section survolée dans l'écran, et la feuille qui l'encadre. */
const HOVER_ATTRIBUTE = 'data-lfd-hovered';
const HOVER_STYLE_ID = 'lfd-preview-hover';

function isSource(value: string): value is MailCopySource {
  return value === 'draft' || value === 'published';
}

/**
 * **L'aperçu d'un e-mail** (C6) : son vrai gabarit, rendu par le serveur
 * avec des données d'exemple — l'objet, puis le corps dans un cadre isolé
 * (`srcdoc`, `sandbox="allow-same-origin"` : AUCUN script — le HTML du serveur
 * reste inerte, liens, formulaires et fenêtres compris). La langue et la
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Le document du cadre, une fois chargé : on y écoute les clics, on y encadre la section survolée. */
  private readonly frameDocument = signal<Document | null>(null);

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
    // S4 — la carte survolée encadre sa section dans l'aperçu.
    effect(() => {
      const doc = this.frameDocument();
      const hovered = this.store.hoveredSection();
      if (doc === null) {
        return;
      }
      for (const element of doc.querySelectorAll(`[${HOVER_ATTRIBUTE}]`)) {
        element.removeAttribute(HOVER_ATTRIBUTE);
      }
      if (hovered !== null) {
        [...doc.querySelectorAll('[data-mail-section]')]
          .find((element) => element.getAttribute('data-mail-section') === hovered)
          ?.setAttribute(HOVER_ATTRIBUTE, '');
      }
    });
  }

  /**
   * Le cadre a chargé un aperçu (S4). Pourquoi `allow-same-origin` sans
   * `allow-scripts`, plutôt qu'un `postMessage` : un message demanderait un
   * script DANS le cadre, donc d'autoriser les scripts du HTML rendu ; ici
   * rien ne s'y exécute, et c'est l'écran qui lit le document du cadre. Les
   * deux drapeaux ENSEMBLE seraient le danger (un script de même origine
   * peut ôter son propre sandbox) — `allow-scripts` ne doit jamais y entrer.
   */
  wire(frame: Pick<HTMLIFrameElement, 'contentDocument'>): void {
    const doc = frame.contentDocument;
    if (doc === null || doc.body === null) {
      this.frameDocument.set(null);
      return;
    }
    this.addHoverStyle(doc);
    doc.addEventListener('click', (event) => this.pick(event));
    this.frameDocument.set(doc);
  }

  /** Un clic dans l'aperçu désigne la carte de sa section, et son texte s'il en a un. */
  private pick(event: MouseEvent): void {
    // Un lien de l'aperçu mène à une adresse d'exemple : on désigne, on ne navigue pas.
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const text = target?.closest('[data-mail-text]') ?? null;
    const section = target?.closest('[data-mail-section]') ?? null;
    this.store.spot.set(
      locateInPreview(
        this.mail(),
        section?.getAttribute('data-mail-section') ?? null,
        text?.getAttribute('data-mail-text') ?? null,
        text?.getAttribute('data-mail-text-of') ?? null,
      ),
    );
  }

  /** La couleur de l'encadré est le token fold de l'écran, lu ici : le cadre ne voit pas nos variables. */
  private addHoverStyle(doc: Document): void {
    if (doc.getElementById(HOVER_STYLE_ID) !== null) {
      return;
    }
    const color = getComputedStyle(this.host.nativeElement)
      .getPropertyValue('--fold-color-primary')
      .trim();
    const style = doc.createElement('style');
    style.id = HOVER_STYLE_ID;
    style.textContent =
      `[${HOVER_ATTRIBUTE}] { outline: 2px dashed ${color || 'currentColor'}; outline-offset: 2px; }` +
      ' [data-mail-section], [data-mail-text] { cursor: pointer; }';
    doc.head.append(style);
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
