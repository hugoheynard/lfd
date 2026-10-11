import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  type ElementRef,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { SHOP_COPY_PREVIEW_JOURNEYS } from '@lfd/contracts/shop-copy-preview';
import {
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { COPY_LOCALES, LOCALE_LABELS } from '../../rules/copy-text';
import { JOURNEY_LABELS } from '../../rules/journey-labels';
import { PreviewLink } from '../../state/preview-link';

const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = COPY_LOCALES.map((locale) => ({
  value: locale,
  label: LOCALE_LABELS[locale],
}));

const VIEWPORT_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'mobile', icon: 'mobile', label: 'Mobile' },
  { value: 'desktop', icon: 'view', label: 'Bureau' },
];

/**
 * **L'aperçu** (plan §7, colonne 3 ; §10 B3) — l'application d'aperçu dans une
 * `<iframe>`, et au-dessus le parcours, la langue et la largeur. Sans adresse
 * configurée, la colonne le dit et l'édition reste possible.
 *
 * L'écoute des messages vit ici parce qu'elle tient à l'iframe ; ce qu'on en
 * fait est dans {@link PreviewLink}.
 */
@Component({
  selector: 'app-shop-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './shop-preview.html',
  styleUrl: './shop-preview.scss',
})
export class ShopPreview {
  protected readonly link = inject(PreviewLink);

  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  /** Adresse de build, jamais saisie : c'est elle seule que l'iframe charge. */
  protected readonly src: SafeResourceUrl | null =
    this.link.origin === null
      ? null
      : inject(DomSanitizer).bypassSecurityTrustResourceUrl(this.link.url);

  protected readonly journeys = SHOP_COPY_PREVIEW_JOURNEYS.map((journey) => ({
    value: journey,
    label: JOURNEY_LABELS[journey],
  }));
  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly viewportOptions = VIEWPORT_OPTIONS;

  constructor() {
    const listener = (event: MessageEvent): void => this.link.receive(event);
    window.addEventListener('message', listener);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('message', listener));
  }

  /** L'iframe a (re)chargé : on lui parle de nouveau dès son `ready`. */
  protected loaded(): void {
    this.link.attach(this.frame()?.nativeElement.contentWindow ?? null);
  }

  protected setLocale(value: string): void {
    const locale = COPY_LOCALES.find((candidate) => candidate === value);
    if (locale !== undefined) {
      this.link.locale.set(locale);
    }
  }

  protected setViewport(value: string): void {
    this.link.viewport.set(value === 'desktop' ? 'desktop' : 'mobile');
  }
}
