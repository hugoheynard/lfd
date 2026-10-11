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
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldChoiceRowComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LibraryChoice } from '../library-choice/library-choice';
import { ReplaceDeposit } from '../replace-deposit/replace-deposit';
import { carrierWord } from '../../rules/carrier-destinations';
import { objectPositionOf } from '../../rules/image-facts';
import { ImageReplacer } from '../../gestures/image-replacer';
import { LibrarySearch } from '../../state/library-search';
import { MediaCarriersStore } from '../../state/media-carriers';
import { ReplaceDraft } from '../../state/replace-draft';
import { NO_SERIES } from '../../rules/series';
import { carriersWording } from '../../rules/media-wording';
import {
  imageLabel,
  pickedCandidate,
  REPLACE_SOURCES,
  type ReplacePanelData,
  type ReplacePanelResult,
  type ReplaceSource,
} from '../../rules/replace-rules';

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
    FoldIconComponent,
    FoldLoadingStateComponent,
    LibraryChoice,
    ReplaceDeposit,
  ],
  // La recherche dans le fonds vit ICI, pas dans `app-library-choice` : revenir
  // au choix après une désignation retrouve la recherche telle qu'on l'a laissée.
  providers: [LibrarySearch, MediaCarriersStore],
  templateUrl: './replace-panel.html',
  styleUrl: './replace-panel.scss',
})
export class ReplacePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<ReplacePanelResult>>(FoldPanelRef);
  private readonly replacer = inject(ImageReplacer);

  readonly data = input.required<ReplacePanelData>();

  protected readonly sources = REPLACE_SOURCES;

  // — Les porteurs de l'ancienne image —
  private readonly carrierList = inject(MediaCarriersStore);
  protected readonly carriers = this.carrierList.carriers.asReadonly();
  protected readonly carriersLoading = this.carrierList.loading.asReadonly();
  protected readonly carriersFailure = this.carrierList.failure.asReadonly();

  // — Désigner la nouvelle —
  protected readonly source = signal<ReplaceSource>('deposit');
  protected readonly seriesId = signal(NO_SERIES);

  protected readonly from = computed(() => this.data().from);

  // — Le geste —
  protected readonly draft = new ReplaceDraft(
    () => this.from(),
    () => !this.carriersLoading() && this.carriersFailure() === null && this.carriers().length > 0,
  );
  protected readonly candidate = this.draft.candidate;
  protected readonly takeOver = this.draft.takeOver;
  protected readonly confirming = this.draft.confirming;
  protected readonly running = this.draft.running;
  protected readonly failure = this.draft.failure;
  protected readonly sameImage = this.draft.sameImage;
  protected readonly canReplace = this.draft.canReplace;
  protected readonly fromLabel = computed(() => imageLabel(this.from()));
  protected readonly fromPosition = computed(() => objectPositionOf(this.from().focal));
  protected readonly toPosition = computed(() =>
    objectPositionOf(this.candidate()?.image.focal ?? null),
  );

  protected readonly carriersWording = computed(() => carriersWording(this.carriers().length));

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
    if (source !== undefined) {
      this.source.set(source);
    }
  }

  protected pick(item: LibraryMediaView): void {
    if (item.url !== this.from().url) {
      this.draft.designate(pickedCandidate(item));
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
      this.draft.refused(outcome.refusal);
      return;
    }
    this.ref.close({ to: candidate.image.url, carriers, description: outcome.description });
  }
}
