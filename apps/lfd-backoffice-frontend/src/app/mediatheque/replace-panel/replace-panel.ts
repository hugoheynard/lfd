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
import {
  MEDIA_LIMITS,
  SOURCE_LOCALE,
  type LibraryMediaView,
  type MediaCarrierView,
  type MediaDetailsPayload,
  type MediaSeriesView,
} from '@lfd/pim-contracts';
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
import type { ImageDescription } from '../image-panel/image-panel';
import { MediaLibraryHttpApi } from '../media-library-http-api';
import { seriesLabel } from '../media-series';
import { IMAGE_MEASURE, checkBeforeUpload } from '../upload-check';

/** « Aucune » dans la liste des séries — une série n'a jamais un identifiant vide. */
const NO_SERIES = '';

/** Une page de recherche dans le fonds : de quoi choisir sans faire défiler un mur. */
const PAGE_SIZE = 24;

/** Les deux façons de désigner la nouvelle image. */
type Source = 'deposit' | 'library';

const SOURCES = [
  { key: 'deposit', label: 'Déposer un fichier' },
  { key: 'library', label: 'Choisir dans le fonds' },
] as const satisfies readonly { key: Source; label: string }[];

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

/** La nouvelle image désignée, et ce qu'on sait de sa description. */
interface Candidate {
  readonly image: ImageDescription;
  /**
   * `true` / `false` : décrite ou non. `null` : déjà au fonds mais hors du fil
   * chargé — on ne sait pas, et dans le doute on n'écrase rien.
   */
  readonly described: boolean | null;
  /** Le dépôt a reconnu des octets déjà au fonds. */
  readonly alreadyInLibrary: boolean;
}

/**
 * Panneau **Remplacer une image** (L7, D5) — repointer TOUS ses porteurs vers
 * une autre image, déposée à l'instant ou choisie dans le fonds.
 *
 * 🔴 Deux appels, dans cet ordre : `POST /media/replace`, puis — seulement si
 * on l'a demandé — `PUT /media` sur la nouvelle pour lui reprendre la
 * description de l'ancienne. Le serveur ne combine pas les deux (le contrôleur
 * dit pourquoi) ; le panneau ne prétend donc pas qu'ils sont atomiques, et un
 * refus de la reprise est rendu à part.
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
  templateUrl: './replace-panel.html',
  styleUrl: './replace-panel.scss',
})
export class ReplacePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<ReplacePanelResult>>(FoldPanelRef);
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly measure = inject(IMAGE_MEASURE);

  readonly data = input.required<ReplacePanelData>();

  protected readonly sources = SOURCES;
  protected readonly limits = {
    accept: MEDIA_LIMITS.accept,
    hint: [
      MEDIA_LIMITS.formatLabels.join(' · '),
      `${String(MEDIA_LIMITS.maxBytes / (1024 * 1024))} Mo par image`,
      `${String(MEDIA_LIMITS.minEdgePixels)} × ${String(MEDIA_LIMITS.minEdgePixels)} px minimum`,
    ].join(' · '),
  };

  // — Les porteurs de l'ancienne image —
  protected readonly carriers = signal<readonly MediaCarrierView[]>([]);
  protected readonly carriersLoading = signal(true);
  protected readonly carriersFailure = signal<string | null>(null);

  // — Désigner la nouvelle —
  protected readonly source = signal<Source>('deposit');
  protected readonly seriesId = signal(NO_SERIES);
  protected readonly uploading = signal(false);
  protected readonly depositRefusal = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly results = signal<readonly LibraryMediaView[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchFailure = signal<string | null>(null);
  private readonly next = signal<string | null>(null);
  protected readonly hasMore = computed(() => this.next() !== null);
  protected readonly loadingMore = signal(false);
  /** La recherche a été lancée au moins une fois (le fonds n'est pas lu d'office avant l'onglet). */
  private searched = false;

  protected readonly candidate = signal<Candidate | null>(null);
  protected readonly takeOver = signal(false);

  // — Le geste —
  protected readonly confirming = signal(false);
  protected readonly running = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly from = computed(() => this.data().from);
  protected readonly fromLabel = computed(() => labelOf(this.from()));
  protected readonly fromPosition = computed(() => objectPositionOf(this.from().focal));
  protected readonly toPosition = computed(() =>
    objectPositionOf(this.candidate()?.image.focal ?? null),
  );
  protected readonly fromDescribed = computed(() => isDescribed(this.from()));

  protected readonly seriesOptions = computed((): readonly FoldSelectOption<string>[] => [
    { value: NO_SERIES, label: 'Aucune série' },
    ...this.data()
      .seriesChoices()
      .map((series) => ({ value: series.id, label: seriesLabel(series) })),
  ]);

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
        void this.loadCarriers(from.url);
      });
    });
  }

  protected word(carrier: MediaCarrierView): string {
    return carrierWord(carrier);
  }

  protected labelOf(image: { readonly name: string; readonly url: string }): string {
    return labelOf(image);
  }

  protected choose(key: string): void {
    const source = SOURCES.find((entry) => entry.key === key)?.key;
    if (source === undefined) {
      return;
    }
    this.source.set(source);
    if (source === 'library' && !this.searched) {
      void this.research();
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
      const seriesId = this.seriesId();
      const uploaded = await this.api.upload(file, seriesId === NO_SERIES ? null : seriesId);
      const known = uploaded.alreadyInLibrary ? this.data().lookup(uploaded.url) : null;
      const image: ImageDescription = known ?? {
        url: uploaded.url,
        name: '',
        alt: { fr: '' },
        focal: null,
        tags: [],
        series: null,
      };
      this.designate({
        image,
        described: uploaded.alreadyInLibrary ? (known === null ? null : isDescribed(known)) : false,
        alreadyInLibrary: uploaded.alreadyInLibrary,
      });
    } catch (caught) {
      this.depositRefusal.set(httpErrorMessage(caught, "Le fichier n'a pas pu être déposé."));
    } finally {
      this.uploading.set(false);
    }
  }

  /** Une saisie posée : la recherche part au serveur (le champ attend la fin de la frappe). */
  protected searchFor(term: string): void {
    this.search.set(term);
    void this.research();
  }

  /** Relit le fonds avec la recherche courante — au serveur, par étiquette. */
  protected async research(): Promise<void> {
    this.searched = true;
    this.searching.set(true);
    this.searchFailure.set(null);
    const search = this.search();
    try {
      const page = await this.api.page({ limit: PAGE_SIZE, q: search });
      if (search !== this.search()) {
        return;
      }
      this.results.set(page.items);
      this.next.set(page.next);
    } catch {
      this.searchFailure.set("La médiathèque n'a pas pu être lue.");
    } finally {
      this.searching.set(false);
    }
  }

  protected async more(): Promise<void> {
    const after = this.next();
    if (after === null || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    const search = this.search();
    try {
      const page = await this.api.page({ limit: PAGE_SIZE, q: search, after });
      if (search === this.search()) {
        this.results.update((current) => [...current, ...page.items]);
        this.next.set(page.next);
      }
    } catch {
      this.searchFailure.set("La suite de la médiathèque n'a pas pu être lue.");
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected pick(item: LibraryMediaView): void {
    if (item.url === this.from().url) {
      return;
    }
    const image: ImageDescription = {
      url: item.url,
      name: item.name,
      alt: item.alt,
      focal: item.focal,
      tags: item.tags,
      series: item.series,
    };
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

  /**
   * Remplace, PUIS reprend la description si on l'a demandé. Un refus du
   * remplacement garde tout à l'écran ; un refus de la reprise ne défait pas
   * le remplacement, déjà fait — il est rendu pour être dit.
   */
  protected async replace(): Promise<void> {
    const candidate = this.candidate();
    if (candidate === null || !this.canReplace()) {
      return;
    }
    const from = this.from();
    const carriers = this.carriers().length;
    this.running.set(true);
    this.failure.set(null);
    try {
      await this.api.replace({ from: from.url, to: candidate.image.url });
    } catch (caught) {
      this.failure.set(httpErrorMessage(caught, "L'image n'a pas pu être remplacée."));
      this.confirming.set(false);
      this.running.set(false);
      return;
    }
    let description: ReplacePanelResult['description'] = null;
    if (this.takeOver()) {
      try {
        await this.api.describe(takenOver(from, candidate.image.url));
        description = true;
      } catch (caught) {
        description = httpErrorMessage(caught, "La description n'a pas pu être reprise.");
      }
    }
    this.running.set(false);
    this.ref.close({ to: candidate.image.url, carriers, description });
  }

  private designate(candidate: Candidate): void {
    this.candidate.set(candidate);
    // Cochée d'office seulement si la nouvelle n'a rien : dans le doute
    // (`null`), on n'écrase pas une description qu'on n'a pas lue.
    this.takeOver.set(candidate.described === false && this.fromDescribed());
    this.confirming.set(false);
    this.failure.set(null);
  }

  private async loadCarriers(url: string): Promise<void> {
    this.carriersLoading.set(true);
    this.carriersFailure.set(null);
    try {
      this.carriers.set(await this.api.carriersOf(url));
    } catch {
      // Un échec de LECTURE, pas une absence de porteurs : sans la liste, on
      // ne sait pas chez qui on remplacerait — le bouton reste fermé.
      this.carriersFailure.set("La liste des porteurs n'a pas pu être lue.");
    } finally {
      this.carriersLoading.set(false);
    }
  }
}

/** « 1 porteur », « 4 porteurs ». */
export function carriersWording(count: number): string {
  return count === 1 ? '1 porteur' : `${String(count)} porteurs`;
}

function labelOf(image: { readonly name: string; readonly url: string }): string {
  return image.name !== '' ? image.name : (image.url.split('/').at(-1) ?? image.url);
}

/**
 * L'image porte-t-elle une description ? L'alternative de repli EST l'URL
 * quand personne n'a écrit (le serveur le rend ainsi) : elle ne compte pas.
 */
export function isDescribed(image: ImageDescription): boolean {
  const alt = image.alt[SOURCE_LOCALE].trim();
  return (
    image.name.trim() !== '' ||
    image.tags.length > 0 ||
    image.focal !== null ||
    (alt !== '' && alt !== image.url)
  );
}

/**
 * Le corps qui reprend la description de l'ancienne sur la nouvelle — TOUS
 * les champs, puisque l'écriture est un remplacement. `seriesId` est OMIS :
 * absent = inchangé, et la nouvelle garde sa série.
 */
export function takenOver(from: ImageDescription, to: string): MediaDetailsPayload {
  const alt = from.alt[SOURCE_LOCALE].trim();
  return {
    url: to,
    name: from.name,
    tags: [...from.tags],
    // Une source vide (ou le repli sur l'URL) veut dire « pas d'alternative » :
    // le contrat refuserait un texte sans sa langue, le serveur retombe sur l'URL.
    ...(alt === '' || alt === from.url ? {} : { alt: from.alt }),
    focal: from.focal,
  };
}
