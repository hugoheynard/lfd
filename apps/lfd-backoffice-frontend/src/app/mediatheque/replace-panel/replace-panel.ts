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
import type { LibraryMediaView, MediaSeriesView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldChoiceRowComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldSearchComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { carrierWord } from '../carriers-panel/carriers-panel';
import { objectPositionOf } from '../image-facts';
import { ImageReplacer } from '../image-replacer';
import type { ImageDescription } from '../image-description';
import { LibrarySearch } from '../library-search';
import { MediaCarriersStore } from '../media-carriers';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { NO_SERIES, chosenSeriesId, seriesOptions } from '../media-series';
import { carriersWording } from '../media-wording';
import {
  blankImage,
  candidateImage,
  depositedDescribed,
  imageLabel,
  isDescribed,
  REPLACE_SOURCES,
  type ReplaceCandidate,
  type ReplaceSource,
} from '../replace-rules';
import { IMAGE_MEASURE, UPLOAD_LIMITS, checkBeforeUpload } from '../upload-check';

/** Ce que le panneau reçoit. */
export interface ReplacePanelData {
  /** L'image à remplacer, telle que le panneau de l'image la décrivait. */
  readonly from: ImageDescription;
  /** Les séries où ranger un fichier déposé — celle de l'ancienne proposée. */
  readonly seriesChoices: () => readonly MediaSeriesView[];
  /**
   * La description d'une image du fil CHARGÉ, ou `null` si elle n'y est pas.
   * Sert à savoir si un fichier déjà au fonds est décrit.
   */
  readonly lookup: (url: string) => ImageDescription | null;
}

/** Ce que le panneau rend quand le remplacement est fait. `undefined` = annulé. */
export interface ReplacePanelResult {
  readonly to: string;
  /** Combien de porteurs le panneau montrait au moment du geste. */
  readonly carriers: number;
  /** `null` : non demandée ; sinon, le refus de la reprise ou `true`. */
  readonly description: true | string | null;
}

/**
 * Panneau **Remplacer une image** (`documentation/mediatheque/mediatheque.md`
 * §2) — repointer TOUS ses porteurs vers une autre image, déposée à l'instant
 * ou choisie dans le fonds. Les deux appels et leur ordre : {@link ImageReplacer}.
 *
 * Un refus du remplacement reste DANS le panneau, saisie intacte : le message
 * du serveur nomme le cas (404, 400, 409), et la nouvelle image désignée ne
 * se re-désigne pas.
 *
 * La reprise est cochée d'office seulement si la nouvelle n'a AUCUNE
 * description : écraser une étiquette, des mots-clés ou un point déjà posés
 * serait une perte qu'on n'a pas demandée.
 */
@Component({
  selector: 'app-replace-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPageSectionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldChoiceRowComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldSearchComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  providers: [LibrarySearch, MediaCarriersStore],
  templateUrl: './replace-panel.html',
  styleUrl: './replace-panel.scss',
})
export class ReplacePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<ReplacePanelResult>>(FoldPanelRef);
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly replacer = inject(ImageReplacer);
  private readonly measure = inject(IMAGE_MEASURE);

  readonly data = input.required<ReplacePanelData>();

  protected readonly sources = REPLACE_SOURCES;
  protected readonly limits = UPLOAD_LIMITS;

  // — Les porteurs de l'ancienne image —
  private readonly carrierList = inject(MediaCarriersStore);
  protected readonly carriers = this.carrierList.carriers.asReadonly();
  protected readonly carriersLoading = this.carrierList.loading.asReadonly();
  protected readonly carriersFailure = this.carrierList.failure.asReadonly();

  // — Désigner la nouvelle —
  protected readonly source = signal<ReplaceSource>('deposit');
  protected readonly seriesId = signal(NO_SERIES);
  protected readonly uploading = signal(false);
  protected readonly depositRefusal = signal<string | null>(null);
  protected readonly library = inject(LibrarySearch);

  protected readonly candidate = signal<ReplaceCandidate | null>(null);
  protected readonly takeOver = signal(false);

  // — Le geste —
  protected readonly confirming = signal(false);
  protected readonly running = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly from = computed(() => this.data().from);
  protected readonly fromLabel = computed(() => imageLabel(this.from()));
  protected readonly fromPosition = computed(() => objectPositionOf(this.from().focal));
  protected readonly toPosition = computed(() =>
    objectPositionOf(this.candidate()?.image.focal ?? null),
  );
  protected readonly fromDescribed = computed(() => isDescribed(this.from()));

  protected readonly seriesOptions = computed((): readonly FoldSelectOption<string>[] =>
    seriesOptions(this.data().seriesChoices()),
  );

  /** La nouvelle est l'ancienne : le serveur refuserait, l'écran le dit avant. */
  protected readonly sameImage = computed(() => this.candidate()?.image.url === this.from().url);

  protected readonly carriersWording = computed(() => carriersWording(this.carriers().length));

  protected readonly canReplace = computed(
    () =>
      this.candidate() !== null &&
      !this.sameImage() &&
      !this.carriersLoading() &&
      this.carriersFailure() === null &&
      this.carriers().length > 0 &&
      !this.running(),
  );

  constructor() {
    // Dans un effet, jamais au constructeur : `input.required()` n'y est pas
    // encore posé (NG0950 — cf. `carriers-panel`).
    effect(() => {
      const from = this.data().from;
      untracked(() => {
        this.seriesId.set(from.series?.id ?? NO_SERIES);
        // Sans la liste, on ne sait pas chez qui : le bouton reste fermé.
        void this.carrierList.load(from.url);
      });
    });
  }

  protected readonly word = carrierWord;
  protected readonly labelOf = imageLabel;

  protected choose(key: string): void {
    const source = REPLACE_SOURCES.find((entry) => entry.key === key)?.key;
    if (source === undefined) {
      return;
    }
    this.source.set(source);
    if (source === 'library') {
      void this.library.open();
    }
  }

  /**
   * Dépose UN fichier — vérifié avant l'envoi comme au dépôt, le serveur
   * restant l'autorité. Des octets déjà au fonds ne créent rien : c'est
   * l'image existante qui est désignée, et l'écran le dit.
   */
  protected async deposit(files: readonly File[]): Promise<void> {
    const file = files[0];
    if (file === undefined || this.uploading()) {
      return;
    }
    this.depositRefusal.set(null);
    this.failure.set(null);
    const local = await checkBeforeUpload(file, this.measure);
    if (local !== null) {
      this.depositRefusal.set(local);
      return;
    }
    this.uploading.set(true);
    try {
      const uploaded = await this.api.upload(file, chosenSeriesId(this.seriesId()));
      const known = uploaded.alreadyInLibrary ? this.data().lookup(uploaded.url) : null;
      this.designate({
        image: known ?? blankImage(uploaded.url),
        described: depositedDescribed(uploaded.alreadyInLibrary, known),
        alreadyInLibrary: uploaded.alreadyInLibrary,
      });
    } catch (caught) {
      this.depositRefusal.set(httpErrorMessage(caught, "Le fichier n'a pas pu être déposé."));
    } finally {
      this.uploading.set(false);
    }
  }

  protected pick(item: LibraryMediaView): void {
    if (item.url === this.from().url) {
      return;
    }
    const image = candidateImage(item);
    this.designate({ image, described: isDescribed(image), alreadyInLibrary: true });
  }

  protected isPicked(url: string): boolean {
    return this.candidate()?.image.url === url;
  }

  protected isCurrent(url: string): boolean {
    return this.from().url === url;
  }

  /** Défait la désignation : on revient au choix. */
  protected undesignate(): void {
    this.candidate.set(null);
    this.takeOver.set(false);
    this.confirming.set(false);
    this.failure.set(null);
  }

  protected ask(): void {
    if (this.canReplace()) {
      this.failure.set(null);
      this.confirming.set(true);
    }
  }

  protected back(): void {
    this.confirming.set(false);
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un refus du remplacement garde tout à l'écran, nouvelle image désignée. */
  protected async replace(): Promise<void> {
    const candidate = this.candidate();
    if (candidate === null || !this.canReplace()) {
      return;
    }
    const carriers = this.carriers().length;
    this.running.set(true);
    this.failure.set(null);
    const outcome = await this.replacer.replace(this.from(), candidate.image.url, this.takeOver());
    this.running.set(false);
    if ('refusal' in outcome) {
      this.failure.set(outcome.refusal);
      this.confirming.set(false);
      return;
    }
    this.ref.close({ to: candidate.image.url, carriers, description: outcome.description });
  }

  private designate(candidate: ReplaceCandidate): void {
    this.candidate.set(candidate);
    // Cochée d'office seulement si la nouvelle n'a rien : dans le doute
    // (`null`), on n'écrase pas une description qu'on n'a pas lue.
    this.takeOver.set(candidate.described === false && this.fromDescribed());
    this.confirming.set(false);
    this.failure.set(null);
  }
}
