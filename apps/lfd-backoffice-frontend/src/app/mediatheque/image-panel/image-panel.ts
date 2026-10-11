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
import { LOCALES, SOURCE_LOCALE, isMediaAltWritten, type FocalPoint } from '@lfd/pim-contracts';
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
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { LOCALE_NAMES } from '../../shared/lang-switch/locale-names';
import { PREVIEW_FRAMES } from '../../pim/catalogue/media-formats';
import { AltDraft } from '../alt-draft';
import {
  type ImageDescription,
  type ImagePanelData,
  type ImagePanelResult,
  factsOf,
  focalAt,
  keyIntent,
  neighboursOf,
  percentLabel,
  sameDescription,
} from '../image-description';
import { ALT_RECOMMENDED_LENGTH, objectPositionOf } from '../image-facts';
import { SeriesChip } from '../series-chip/series-chip';
import { SeriesChoice } from '../series-choice';
import { TagChip } from '../tag-chip/tag-chip';
import { TagEditor } from '../tag-editor';

/**
 * Panneau **Décrire une image** — son étiquette, ses alternatives, son point,
 * et ses mots-clés (depuis le 2026-10-10 : la bande pose un mot sur beaucoup
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
  /** Les cadres de la table des formats — ceux que la boutique coupe, et le 21/9 des bannières (`mediatheque.md` §6). */
  protected readonly crops = PREVIEW_FRAMES;
  protected readonly recommended = ALT_RECOMMENDED_LENGTH;

  /** L'image à l'écran — celle de l'ouverture, puis celle où l'on a navigué. */
  protected readonly shown = signal<ImageDescription | null>(null);
  /** Ce qui était écrit en arrivant sur l'image : la référence de « modifié ». */
  private readonly origin = signal<ImagePanelResult | null>(null);

  protected readonly label = signal('');
  /** Les alternatives en saisie, les trois langues ensemble. */
  protected readonly alt = new AltDraft();
  private readonly draft = this.alt.text;
  protected readonly focal = signal<FocalPoint | null>(null);
  /** Les mots-clés de l'image, ce qu'on tape, et ce que le vocabulaire propose. */
  protected readonly tagEditor = new TagEditor(() => this.data().vocabulary);
  protected readonly seriesChoice = new SeriesChoice(() => this.data().seriesChoices);
  /** On a demandé à partir avec une saisie en cours : le pied le demande. */
  protected readonly leaving = signal(false);
  /** Une navigation enregistre : les flèches attendent. */
  protected readonly moving = signal(false);

  protected readonly objectPosition = computed(() => objectPositionOf(this.focal()));

  protected readonly dirty = computed(() => {
    const origin = this.origin();
    return origin !== null && !sameDescription(origin, this.result());
  });

  private readonly neighbours = computed(() =>
    neighboursOf(this.data().sequence?.images() ?? [], this.shown()?.url ?? null),
  );

  protected readonly hasSequence = computed(() => this.data().sequence !== undefined);
  protected readonly previous = computed(() => this.neighbours().previous);
  protected readonly next = computed(() => this.neighbours().next);

  /** Les informations, mises en forme ; `null` quand le dépôt ne les a pas mesurées. */
  protected readonly facts = computed(() => factsOf(this.shown()));

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

  /** Pose le point focal là où l'on clique — en fractions, cf. {@link focalAt}. */
  protected point(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const focal = focalAt(event.clientX, event.clientY, target.getBoundingClientRect());
    if (focal !== null) {
      this.focal.set(focal);
    }
  }

  /** Retire la désignation — distinct de « au centre », qui est un choix. */
  protected unpoint(): void {
    this.focal.set(null);
  }

  protected readonly percent = percentLabel;

  protected showCarriers(): void {
    const shown = this.shown();
    if (shown !== null) {
      this.data().showCarriers?.(shown.url);
    }
  }

  /**
   * Passe au remplacement. Fermé tant qu'une saisie est en cours : ouvrir un
   * autre panneau ferme celui-ci, et la saisie serait perdue sans un mot.
   */
  protected replaceImage(): void {
    const shown = this.shown();
    if (shown !== null && !this.dirty()) {
      this.data().replace?.(shown.url);
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
      let saved = false;
      try {
        saved = await sequence.save(this.result());
      } finally {
        // Un `save` qui lève ne doit pas laisser les flèches bloquées.
        this.moving.set(false);
      }
      if (!saved) {
        return;
      }
    }
    this.load(target);
  }

  protected onKey(event: KeyboardEvent): void {
    const intent = keyIntent(event.key, event.target);
    if (intent === null) {
      return;
    }
    event.preventDefault();
    if (intent === 'cancel') {
      this.cancel();
    } else {
      void this.go(intent);
    }
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
    this.draft.set(isMediaAltWritten(image.alt, image.url) ? image.alt : { fr: '' });
    this.focal.set(image.focal);
    this.tagEditor.reset(image.tags);
    this.seriesChoice.reset(image.series);
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
      alt: isMediaAltWritten(text, this.shown()?.url ?? '') ? text : { fr: '' },
      focal: this.focal(),
      tags: this.tagEditor.tags(),
      seriesId: this.seriesChoice.current()?.id ?? null,
    };
  }
}
