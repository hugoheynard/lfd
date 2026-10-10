import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  LOCALES,
  SOURCE_LOCALE,
  writeLocalized,
  type FocalPoint,
  type LocalizedText,
} from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LOCALE_NAMES } from '../../shared/lang-switch/locale-names';
import { normalizeTag } from '../tag-palette';
import { TagChip } from '../tag-chip/tag-chip';

/** Combien de suggestions au plus : au-delà, on tape une lettre de plus. */
const SUGGESTION_LIMIT = 8;

/** Ce qu'on décrit, et ce qui en est déjà écrit. */
export interface ImagePanelData {
  readonly url: string;
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
  /** Le vocabulaire du fonds, d'où viennent les suggestions. */
  readonly vocabulary: readonly string[];
}

/** Ce que le panneau rend. `undefined` au `closed` = annulé, et rien n'est écrit. */
export interface ImagePanelResult {
  readonly name: string;
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  readonly tags: readonly string[];
}

/**
 * Panneau **Décrire une image** — son étiquette, ses alternatives, son point,
 * et ses mots-clés (L1, 2026-10-10 : la bande pose un mot sur beaucoup
 * d'images, le panneau règle tous ceux d'UNE image).
 *
 * 🔴 C'est le SEUL point où ces trois champs s'écrivent (Hugo, 2026-09-23). Ils
 * décrivaient l'image depuis la fiche produit jusqu'à ce jour-là, et une image
 * étant partagée, une correction faite sur une fiche changeait silencieusement
 * ce qu'une autre affichait.
 *
 * Les trois langues ensemble, et pas une à la fois : une traduction se juge à
 * côté de sa source, pas de mémoire. C'est la raison qui valait déjà dans le
 * panneau de la fiche, et elle n'a pas changé d'adresse.
 */
@Component({
  selector: 'app-image-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldInputComponent, FoldButtonComponent, TagChip],
  templateUrl: './image-panel.html',
  styleUrl: './image-panel.scss',
})
export class ImagePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<ImagePanelResult>>(FoldPanelRef);

  readonly data = input.required<ImagePanelData>();

  protected readonly locales = LOCALES;
  protected readonly names = LOCALE_NAMES;
  protected readonly sourceLocale = SOURCE_LOCALE;

  protected readonly label = signal('');
  protected readonly draft = signal<LocalizedText>({ fr: '' });
  protected readonly focal = signal<FocalPoint | null>(null);
  protected readonly tags = signal<readonly string[]>([]);
  /** Ce qu'on tape dans le champ « Ajouter un mot-clé ». */
  protected readonly tagDraft = signal('');

  /** Ce qui sera écrit — montré dès que la normalisation change la saisie. */
  protected readonly tagWritten = computed(() => normalizeTag(this.tagDraft()));

  /**
   * Les mots existants qui contiennent la saisie, hors ceux déjà portés.
   *
   * N'importe où dans le mot, comme la bande : « sant » trouve « croissant ».
   * Proposer l'existant, c'est ce qui évite « croisant » à côté de
   * « croissant ».
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

  constructor() {
    effect(() => {
      const data = this.data();
      this.label.set(data.name);
      // L'alternative de repli EST l'URL quand personne n'a écrit (le serveur
      // le dit ainsi). L'afficher dans le champ ferait croire à une phrase
      // rédigée, et la première sauvegarde la figerait.
      this.draft.set(data.alt[SOURCE_LOCALE] === data.url ? { fr: '' } : data.alt);
      this.focal.set(data.focal);
      this.tags.set(data.tags);
    });
  }

  protected valueOf(locale: string): string {
    return this.draft()[locale as keyof LocalizedText] ?? '';
  }

  protected write(locale: (typeof LOCALES)[number], value: string): void {
    if (locale === SOURCE_LOCALE) {
      // 🔴 `writeLocalized` REFUSE d'effacer la langue source, et son JSDoc dit
      // pourquoi : le type l'exige, « c'est à la validation de l'écran de le
      // dire ». Or vider le français est ici un geste légitime — c'est ainsi
      // qu'on déclare qu'une image n'a pas d'alternative. Le panneau le porte
      // donc lui-même, et {@link submit} en fait le repli.
      this.draft.update((text) => ({ ...text, [SOURCE_LOCALE]: value }));
      return;
    }
    this.draft.update((text) => writeLocalized(text, locale, value));
  }

  /**
   * Pose le point focal là où l'on clique, en **fractions**.
   *
   * Jamais en pixels : l'image est recadrée à des tailles qu'on ne connaît pas,
   * et une coordonnée absolue ne voudrait rien dire une fois la vignette
   * produite. Les fractions, elles, survivent à tous les cadres.
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

  /** Retire la désignation — distinct de « au centre », qui est un choix. */
  protected unpoint(): void {
    this.focal.set(null);
  }

  protected readonly focalLabel = (): string => {
    const point = this.focal();
    return point === null
      ? 'Aucun point posé — le cadrage retombe au centre.'
      : `Point posé à ${percent(point.x)} / ${percent(point.y)}.`;
  };

  protected submit(): void {
    const text = this.draft();
    this.ref.close({
      name: this.label().trim(),
      // Une source vide veut dire « pas d'alternative » : le serveur retombera
      // sur l'URL, qui se VOIT, plutôt que sur une chaîne vide qui passerait
      // pour une description rédigée.
      //
      // Les traductions partent avec elle : une alternative italienne sans
      // français n'est pas une alternative à moitié écrite, c'est une phrase
      // que plus rien ne rattache à ce qu'elle traduit.
      alt: text[SOURCE_LOCALE].trim() === '' ? { fr: '' } : text,
      focal: this.focal(),
      tags: this.tags(),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function percent(value: number): string {
  return `${String(Math.round(value * 100))} %`;
}
