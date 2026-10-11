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
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { JOURNEY_LABELS } from '../../rules/journey-labels';
import { PreviewLink } from '../../state/preview-link';

const VIEWPORT_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'mobile', icon: 'mobile', label: 'Mobile' },
  { value: 'desktop', icon: 'view', label: 'Bureau' },
];

/**
 * Le NOM de la fenêtre détachée, fixe : un second `window.open` sous ce nom
 * ramène la même fenêtre au lieu d'en ouvrir une autre.
 */
export const PREVIEW_WINDOW_NAME = 'lfc-shop-copy-preview';
/** Une fenêtre de téléphone ; l'aperçu se redimensionne lui-même selon la largeur choisie. */
const PREVIEW_WINDOW_FEATURES = 'popup,width=430,height=900';
/** On ne peut pas être prévenu de la fermeture d'une autre origine : on la sonde. */
export const CLOSED_POLL_MS = 1000;

/**
 * **L'aperçu** (plan §7, colonne 3 ; §10 B3) — l'application d'aperçu dans une
 * `<iframe>`, et au-dessus le parcours et la largeur — la langue est celle
 * de l'écran, choisie en tête de page. Sans adresse
 * configurée, la colonne le dit et l'édition reste possible.
 *
 * **La fenêtre détachée** (2026-10-11) : « Ouvrir dans une fenêtre » déplace
 * l'aperçu dans une fenêtre à part, qu'on pose sur un autre écran. Une seule
 * cible à la fois — la colonne dit alors où il est, et « Ramener ici » le
 * rapatrie. La fermeture de la fenêtre est sondée, et rétablit l'iframe.
 * Pas de `noopener` : l'aperçu nous répond par `window.opener`.
 *
 * L'écoute des messages vit ici parce qu'elle tient aux fenêtres ; ce qu'on en
 * fait est dans {@link PreviewLink}.
 */
@Component({
  selector: 'app-shop-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
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
  private readonly notify = inject(NotifyService);

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
  protected readonly viewportOptions = VIEWPORT_OPTIONS;

  private popup: Window | null = null;
  private closedPoll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const listener = (event: MessageEvent): void => this.link.receive(event);
    window.addEventListener('message', listener);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', listener);
      this.stopPolling();
    });
  }

  /** Ouvre l'aperçu dans sa fenêtre — ou ramène celle qui l'est déjà au premier plan. */
  protected openWindow(): void {
    if (this.popup !== null && !this.popup.closed) {
      this.popup.focus();
      return;
    }
    const popup = window.open(this.link.url, PREVIEW_WINDOW_NAME, PREVIEW_WINDOW_FEATURES);
    if (popup === null) {
      this.notify.error(
        null,
        'Le navigateur a bloqué la fenêtre d’aperçu : autorisez les fenêtres pour ce site.',
      );
      return;
    }
    this.popup = popup;
    this.link.detachTo(popup);
    popup.focus();
    this.stopPolling();
    this.closedPoll = setInterval(() => {
      if (this.popup?.closed !== false) {
        this.backToColumn();
      }
    }, CLOSED_POLL_MS);
  }

  /** « Ramener ici » : la fenêtre fermée, l'iframe rétablie. */
  protected bringBack(): void {
    this.popup?.close();
    this.backToColumn();
  }

  private backToColumn(): void {
    this.stopPolling();
    this.popup = null;
    this.link.reattach();
  }

  private stopPolling(): void {
    if (this.closedPoll !== null) {
      clearInterval(this.closedPoll);
      this.closedPoll = null;
    }
  }

  /** L'iframe a (re)chargé : on lui parle de nouveau dès son `ready`. */
  protected loaded(): void {
    this.link.attach(this.frame()?.nativeElement.contentWindow ?? null);
  }

  protected setViewport(value: string): void {
    this.link.viewport.set(value === 'desktop' ? 'desktop' : 'mobile');
  }
}
