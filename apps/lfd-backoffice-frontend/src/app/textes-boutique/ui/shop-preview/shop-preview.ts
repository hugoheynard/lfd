import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  SHOP_COPY_ORDER_STEPS,
  SHOP_COPY_OUTSIDE_SCREENS,
  type ShopCopyOrderStep,
  type ShopCopyOutsideScreen,
} from '@lfd/contracts/shop-copy-preview';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ORDER_STEP_LABELS, OUTSIDE_SCREEN_LABELS, stepNote } from '../../rules/audience-labels';
import { previewScale, scaleLabel } from '../../rules/preview-scale';
import { PreviewLink } from '../../state/preview-link';

/** Le segment « Hors commande » de la frise. */
const OUTSIDE = 'outside';
/** La part de la hauteur de la fenêtre que la colonne donne à l'aperçu. */
const DISPLAY_HEIGHT_RATIO = 0.8;

const ORDER_STEP_OPTIONS: readonly FoldViewToggleOption[] = SHOP_COPY_ORDER_STEPS.map((step) => ({
  value: step,
  label: String(SHOP_COPY_ORDER_STEPS.indexOf(step) + 1),
  ariaLabel: ORDER_STEP_LABELS[step],
}));

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
 * `<iframe>`, et au-dessus la frise des sept étapes (plus « Hors commande »)
 * et la largeur — la langue et la clientèle sont celles de l'écran, choisies
 * en tête de page.
 *
 * **Dézoomée** (2026-10-11) : l'iframe est rendue à sa vraie largeur
 * (`SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS`) puis réduite par `transform: scale` à
 * la largeur de la colonne — la boutique y prend sa vraie mise en page
 * bureau. Le navigateur ramène les clics à travers la transformation. Sans adresse
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
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
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

  protected readonly viewportOptions = VIEWPORT_OPTIONS;

  /** Les écrans hors commande de la clientèle — aucun pour qui n'est pas connecté. */
  private readonly outsideScreens = computed<readonly ShopCopyOutsideScreen[]>(
    () => SHOP_COPY_OUTSIDE_SCREENS[this.link.audience()],
  );

  /** La frise : sept étapes numérotées, et « Hors commande » pour qui est connecté. */
  protected readonly stageOptions = computed<readonly FoldViewToggleOption[]>(() =>
    this.outsideScreens().length === 0
      ? ORDER_STEP_OPTIONS
      : [...ORDER_STEP_OPTIONS, { value: OUTSIDE, label: 'Hors commande' }],
  );
  protected readonly outsideOptions = computed<readonly FoldViewToggleOption[]>(() =>
    this.outsideScreens().map((screen) => ({
      value: screen,
      label: OUTSIDE_SCREEN_LABELS[screen],
    })),
  );
  private readonly orderStep = computed<ShopCopyOrderStep | null>(
    () => SHOP_COPY_ORDER_STEPS.find((step) => step === this.link.step()) ?? null,
  );
  protected readonly stage = computed(() => this.orderStep() ?? OUTSIDE);
  protected readonly stepTitle = computed(() => {
    const step = this.orderStep();
    return step === null ? null : ORDER_STEP_LABELS[step];
  });
  protected readonly note = computed(() => stepNote(this.link.audience(), this.link.step()));

  /** La largeur de la colonne, relevée par un `ResizeObserver`. */
  private readonly columnWidth = signal(0);
  protected readonly scale = computed(() =>
    previewScale(
      this.link.viewport(),
      this.columnWidth(),
      window.innerHeight * DISPLAY_HEIGHT_RATIO,
    ),
  );
  protected readonly scaleLabel = computed(() => scaleLabel(this.scale().k));

  private popup: Window | null = null;
  private closedPoll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const listener = (event: MessageEvent): void => this.link.receive(event);
    window.addEventListener('message', listener);
    const host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
    const resize = new ResizeObserver(() => this.columnWidth.set(host.clientWidth));
    resize.observe(host);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', listener);
      resize.disconnect();
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

  /** Une étape de la frise ; « Hors commande » ouvre le premier écran de la clientèle. */
  protected setStage(value: string): void {
    const step = SHOP_COPY_ORDER_STEPS.find((candidate) => candidate === value);
    const first = this.outsideScreens()[0];
    if (step !== undefined) {
      this.link.setStep(step);
    } else if (value === OUTSIDE && first !== undefined) {
      this.link.setStep(first);
    }
  }

  protected setOutside(value: string): void {
    const screen = this.outsideScreens().find((candidate) => candidate === value);
    if (screen !== undefined) {
      this.link.setStep(screen);
    }
  }

  protected setViewport(value: string): void {
    this.link.viewport.set(value === 'desktop' ? 'desktop' : 'mobile');
  }
}
