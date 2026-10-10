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
import {
  LOCALES,
  SOURCE_LOCALE,
  writeLocalized,
  type FocalPoint,
  type LocalizedText,
  type MediaFactsView,
  type MediaSeriesRefView,
  type MediaSeriesView,
} from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPageSectionComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { LOCALE_NAMES } from '../../shared/lang-switch/locale-names';
import {
  ALT_RECOMMENDED_LENGTH,
  fileNameOf,
  formatBytes,
  formatContentType,
  formatDimensions,
  formatParisMoment,
  objectPositionOf,
  usesWording,
} from '../image-facts';
import { normalizeTag } from '../tag-palette';
import { seriesLabel } from '../media-series';
import { SeriesChip } from '../series-chip/series-chip';
import { TagChip } from '../tag-chip/tag-chip';

/** « Aucune » dans la liste des séries — une série n'a jamais un identifiant vide. */
const NO_SERIES = '';

/** Combien de suggestions au plus : au-delà, on tape une lettre de plus. */
const SUGGESTION_LIMIT = 8;

/** Les cadres que la boutique annonce (doc médiathèque §6) — ce que le point décide. */
const CROPS = [
  { ratio: '3 / 2', short: '3/2', label: 'Ouverture' },
  { ratio: '4 / 3', short: '4/3', label: 'Vignette' },
  { ratio: '1 / 1', short: '1/1', label: 'Carré' },
] as const;

/** Ce qu'on sait d'une image sans l'avoir décrite — lu, jamais écrit ici. */
export interface ImageFacts extends MediaFactsView {
  readonly depositedAt: string;
  readonly uses: number;
}

/** Une image telle que le panneau la décrit. */
export interface ImageDescription {
  readonly url: string;
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
  /** Sa série (L3) ; `null` = aucune. */
  readonly series: MediaSeriesRefView | null;
  /** Absent : la section « Informations » ne s'affiche pas. */
  readonly facts?: ImageFacts;
}

/**
 * Décrire une série d'images à la suite, sans refermer le panneau.
 *
 * `images` est relu à chaque pas : le fil peut s'allonger ou être réécrit
 * pendant qu'on décrit. `save` rend `false` quand l'écriture a été refusée —
 * le panneau reste alors sur l'image, avec ce qui était saisi.
 */
export interface ImagePanelSequence {
  readonly images: () => readonly ImageDescription[];
  readonly save: (result: ImagePanelResult) => Promise<boolean>;
}

/** Ce qu'on décrit, et ce qui en est déjà écrit. */
export interface ImagePanelData extends ImageDescription {
  /** Le vocabulaire du fonds, d'où viennent les suggestions. */
  readonly vocabulary: readonly string[];
  /**
   * Les séries où la rattacher — relues à chaque ouverture de la liste.
   * Absent : la série se lit, elle ne se change pas.
   */
  readonly seriesChoices?: () => readonly MediaSeriesView[];
  readonly sequence?: ImagePanelSequence;
  /** Ouvre la liste des porteurs — « voir où » des informations. */
  readonly showCarriers?: (url: string) => void;
}

/**
 * Ce que le panneau rend. `undefined` au `closed` = annulé, et rien n'est écrit.
 *
 * `url` dit QUELLE image : après une navigation, ce n'est plus celle de
 * l'ouverture.
 */
export interface ImagePanelResult {
  readonly url: string;
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
  /** Un identifiant rattache, `null` détache — envoyé au même enregistrement. */
  readonly seriesId: string | null;
}

/**
 * Panneau **Décrire une image** — son étiquette, ses alternatives, son point,
 * et ses mots-clés (L1, 2026-10-10 : la bande pose un mot sur beaucoup
 * d'images, le panneau règle tous ceux d'UNE image).
 *
 * 🔴 C'est le SEUL point où ces champs s'écrivent (Hugo, 2026-09-23). Ils
 * décrivaient l'image depuis la fiche produit jusqu'à ce jour-là, et une image
 * étant partagée, une correction faite sur une fiche changeait silencieusement
 * ce qu'une autre affichait.
 *
 * Les trois langues ensemble, et pas une à la fois : une traduction se juge à
 * côté de sa source, pas de mémoire.
 *
 * ⚠️ `disableClose` : Échap et le fond ne referment plus en silence — Échap
 * passe par {@link cancel}, qui demande avant de jeter une saisie. La croix de
 * l'en-tête, elle, ferme sans demander : `fold-panel-header` n'offre pas de
 * veto (`closed` « is not a veto hook », lu dans `fold-ng.d.ts` le 2026-10-10).
 */
@Component({
  selector: 'app-image-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPageSectionComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    SeriesChip,
    TagChip,
  ],
  templateUrl: './image-panel.html',
  styleUrl: './image-panel.scss',
  host: { '(keydown)': 'onKey($event)' },
})
export class ImagePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', disableClose: true };

  private readonly ref = inject<FoldPanelRef<ImagePanelResult>>(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<ImagePanelData>();

  protected readonly locales = LOCALES;
  protected readonly names = LOCALE_NAMES;
  protected readonly sourceLocale = SOURCE_LOCALE;
  protected readonly crops = CROPS;
  protected readonly recommended = ALT_RECOMMENDED_LENGTH;

  /** L'image à l'écran — celle de l'ouverture, puis celle où l'on a navigué. */
  protected readonly shown = signal<ImageDescription | null>(null);
  /** Ce qui était écrit en arrivant sur l'image : la référence de « modifié ». */
  private readonly origin = signal<ImagePanelResult | null>(null);

  protected readonly label = signal('');
  protected readonly draft = signal<LocalizedText>({ fr: '' });
  protected readonly focal = signal<FocalPoint | null>(null);
  protected readonly tags = signal<readonly string[]>([]);
  /** La série, telle qu'elle partira ; `null` = aucune. */
  protected readonly series = signal<MediaSeriesRefView | null>(null);
  /** « Changer » a été demandé : la liste des séries s'ouvre. */
  protected readonly changingSeries = signal(false);
  /** Ce qu'on tape dans le champ « Ajouter un mot-clé ». */
  protected readonly tagDraft = signal('');
  /** On a demandé à partir avec une saisie en cours : le pied le demande. */
  protected readonly leaving = signal(false);
  /** Une navigation enregistre : les flèches attendent. */
  protected readonly moving = signal(false);

  /** Ce qui sera écrit — montré dès que la normalisation change la saisie. */
  protected readonly tagWritten = computed(() => normalizeTag(this.tagDraft()));

  /**
   * Les mots existants qui contiennent la saisie, hors ceux déjà portés.
   *
   * N'importe où dans le mot, comme la bande : « sant » trouve « croissant ».
   */
  protected readonly suggestions = computed(() => {
    const needle = this.tagWritten();
    if (needle === '') {
      return [];
    }
    const worn = new Set(this.tags());
    return this.data()
      .vocabulary.filter((word) => word.includes(needle) && !worn.has(word))
      .slice(0, SUGGESTION_LIMIT);
  });

  protected readonly canChangeSeries = computed(() => this.data().seriesChoices !== undefined);

  protected readonly seriesOptions = computed((): readonly FoldSelectOption<string>[] => [
    { value: NO_SERIES, label: 'Aucune série' },
    ...(this.data().seriesChoices?.() ?? []).map((series) => ({
      value: series.id,
      label: seriesLabel(series),
    })),
  ]);

  protected readonly objectPosition = computed(() => objectPositionOf(this.focal()));

  protected readonly dirty = computed(() => {
    const origin = this.origin();
    return origin !== null && !sameDescription(origin, this.result());
  });

  private readonly neighbours = computed(() => {
    const sequence = this.data().sequence;
    const shown = this.shown();
    if (sequence === undefined || shown === null) {
      return { previous: null, next: null };
    }
    const images = sequence.images();
    const at = images.findIndex((image) => image.url === shown.url);
    return at < 0
      ? { previous: null, next: null }
      : { previous: images[at - 1] ?? null, next: images[at + 1] ?? null };
  });

  protected readonly hasSequence = computed(() => this.data().sequence !== undefined);
  protected readonly previous = computed(() => this.neighbours().previous);
  protected readonly next = computed(() => this.neighbours().next);

  /** Les informations, mises en forme ; `null` quand le dépôt ne les a pas mesurées. */
  protected readonly facts = computed(() => {
    const shown = this.shown();
    const facts = shown?.facts;
    if (shown === null || facts === undefined) {
      return null;
    }
    return {
      format: formatContentType(facts.contentType),
      dimensions: formatDimensions(facts.width, facts.height),
      weight: formatBytes(facts.bytes),
      depositedAt: formatParisMoment(facts.depositedAt),
      fileName: fileNameOf(shown.url),
      uses: facts.uses,
      usesWording: usesWording(facts.uses),
    };
  });

  constructor() {
    // 🔴 `untracked` : `load` lit les signaux qu'il écrit (l'état d'origine
    // se calcule par `result()`). Sans lui, l'effet s'abonnait à TOUS — le
    // point, les mots-clés, l'étiquette — et chaque geste rechargeait l'image
    // d'origine par-dessus : rien ne tenait à l'écran (vu le 2026-10-10).
    effect(() => {
      const data = this.data();
      untracked(() => this.load(data));
    });
  }

  protected valueOf(locale: string): string {
    return this.draft()[locale as keyof LocalizedText] ?? '';
  }

  protected lengthOf(locale: string): number {
    return this.valueOf(locale).trim().length;
  }

  /** Au-delà, un avertissement — jamais un refus : une phrase juste vaut mieux qu'une phrase courte. */
  protected tooLong(locale: string): boolean {
    return this.lengthOf(locale) > ALT_RECOMMENDED_LENGTH;
  }

  protected write(locale: (typeof LOCALES)[number], value: string): void {
    if (locale === SOURCE_LOCALE) {
      // 🔴 `writeLocalized` REFUSE d'effacer la langue source. Or vider le
      // français est ici un geste légitime — c'est ainsi qu'on déclare qu'une
      // image n'a pas d'alternative. Le panneau le porte donc lui-même, et
      // {@link result} en fait le repli.
      this.draft.update((text) => ({ ...text, [SOURCE_LOCALE]: value }));
      return;
    }
    this.draft.update((text) => writeLocalized(text, locale, value));
  }

  /**
   * Pose le point focal là où l'on clique, en **fractions** de l'image.
   *
   * Jamais en pixels : l'image est recadrée à des tailles qu'on ne connaît pas.
   * La cible épouse l'image (pas de bandes autour), sans quoi un clic dans la
   * marge donnerait une fraction fausse.
   */
  protected point(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const box = target.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return;
    }
    this.focal.set({
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    });
  }

  /** Retire la désignation — distinct de « au centre », qui est un choix. */
  protected unpoint(): void {
    this.focal.set(null);
  }

  protected percent(value: number): string {
    return `${String(Math.round(value * 100))} %`;
  }

  /** Ajoute la saisie (ou une suggestion), normalisée. Un mot déjà porté ne double pas. */
  protected addTag(raw: string): void {
    const tag = normalizeTag(raw);
    if (tag !== '' && !this.tags().includes(tag)) {
      this.tags.update((current) => [...current, tag]);
    }
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.update((current) => current.filter((kept) => kept !== tag));
  }

  /** Rattache à une série de la liste, ou détache (« Aucune série »). */
  protected chooseSeries(id: string): void {
    const found = this.data()
      .seriesChoices?.()
      .find((series) => series.id === id);
    this.series.set(
      found === undefined ? null : { id: found.id, title: found.title, shotOn: found.shotOn },
    );
    this.changingSeries.set(false);
  }

  protected showCarriers(): void {
    const shown = this.shown();
    if (shown !== null) {
      this.data().showCarriers?.(shown.url);
    }
  }

  protected async copyAddress(): Promise<void> {
    const shown = this.shown();
    if (shown === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shown.url);
      this.notify.success('Adresse copiée.');
    } catch (caught) {
      this.notify.error(caught, "L'adresse n'a pas pu être copiée.");
    }
  }

  /**
   * Passe à l'image voisine. Une saisie en cours s'ENREGISTRE avant de passer,
   * sans demander : on décrit une série pour aller vite, et une question à
   * chaque image ferait cliquer « oui » sans lire. Un refus du serveur retient
   * sur l'image, saisie intacte.
   */
  protected async go(direction: 'previous' | 'next'): Promise<void> {
    const target = direction === 'previous' ? this.previous() : this.next();
    const sequence = this.data().sequence;
    if (target === null || sequence === undefined || this.moving()) {
      return;
    }
    if (this.dirty()) {
      this.moving.set(true);
      const saved = await sequence.save(this.result());
      this.moving.set(false);
      if (!saved) {
        return;
      }
    }
    this.load(target);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    if (isEditable(event.target)) {
      return;
    }
    event.preventDefault();
    void this.go(event.key === 'ArrowLeft' ? 'previous' : 'next');
  }

  protected submit(): void {
    if (this.dirty()) {
      this.ref.close(this.result());
    }
  }

  /** Annuler — sans rien demander s'il n'y a rien à perdre. */
  protected cancel(): void {
    if (this.dirty()) {
      this.leaving.set(true);
      return;
    }
    this.ref.close();
  }

  protected discard(): void {
    this.ref.close();
  }

  protected keepEditing(): void {
    this.leaving.set(false);
  }

  private load(image: ImageDescription): void {
    this.shown.set(image);
    this.label.set(image.name);
    // L'alternative de repli EST l'URL quand personne n'a écrit (le serveur
    // le dit ainsi). L'afficher dans le champ ferait croire à une phrase
    // rédigée, et la première sauvegarde la figerait.
    this.draft.set(image.alt[SOURCE_LOCALE] === image.url ? { fr: '' } : image.alt);
    this.focal.set(image.focal);
    this.tags.set(image.tags);
    this.series.set(image.series);
    this.changingSeries.set(false);
    this.tagDraft.set('');
    this.leaving.set(false);
    this.origin.set(this.result());
  }

  private result(): ImagePanelResult {
    const text = this.draft();
    return {
      url: this.shown()?.url ?? '',
      name: this.label().trim(),
      // Une source vide veut dire « pas d'alternative » : le serveur retombera
      // sur l'URL, qui se VOIT. Les traductions partent avec elle : une
      // alternative italienne sans français n'est rattachée à rien.
      alt: text[SOURCE_LOCALE].trim() === '' ? { fr: '' } : text,
      focal: this.focal(),
      tags: this.tags(),
      seriesId: this.series()?.id ?? null,
    };
  }
}

function sameDescription(a: ImagePanelResult, b: ImagePanelResult): boolean {
  return (
    a.name === b.name &&
    a.seriesId === b.seriesId &&
    a.focal?.x === b.focal?.x &&
    a.focal?.y === b.focal?.y &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, at) => b.tags[at] === tag) &&
    LOCALES.every((locale) => (a.alt[locale] ?? '').trim() === (b.alt[locale] ?? '').trim())
  );
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select') !== null)
  );
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
