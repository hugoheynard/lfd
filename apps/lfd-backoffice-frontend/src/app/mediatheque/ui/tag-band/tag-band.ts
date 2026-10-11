import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  effect,
  computed,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
} from 'fold-ng';

import { CanDirective } from '../../../shared/can/can.directive';
import { TagChip } from '../tag-chip/tag-chip';
import { foldCut, layoutOf, pinFirst, type FoldLayout } from '../../rules/tag-fold';
import { TagPaletteStore, type PaletteTag } from '../../state/tag-palette';

/**
 * **La bande de mots-clés** — un champ qui cherche OU crée, et les mots,
 * repliés à deux rangées.
 *
 * Un seul champ plutôt que deux (retour Hugo, 2026-10-10) : on cherche avant
 * de créer, et un « Nouveau mot-clé » à côté d'un « Chercher » faisait créer
 * des doublons qu'une recherche aurait trouvés. « Créer » n'apparaît que
 * lorsqu'aucun mot n'est exactement la saisie.
 *
 * Repliée, la bande montre les mots les plus portés ; l'armé et ceux du filtre
 * sont épinglés en tête, pour ne jamais disparaître derrière « + N autres ».
 *
 * Le repli se MESURE (`ResizeObserver` sur la largeur de la liste) plutôt
 * qu'un `max-height` : un `max-height` cache sans dire combien, et laisse les
 * pastilles masquées dans l'ordre de tabulation.
 */
@Component({
  selector: 'app-tag-band',
  imports: [
    CanDirective,
    FoldButtonComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldPopoverTriggerDirective,
    FoldSearchComponent,
    TagChip,
  ],
  templateUrl: './tag-band.html',
  styleUrl: './tag-band.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagBand {
  protected readonly palette = inject(TagPaletteStore);

  /** Les mots que le filtre du fil retient : épinglés, comme l'armé. */
  readonly filterTags = input<readonly string[]>([]);

  readonly renameRequested = output<PaletteTag>();
  readonly removeRequested = output<PaletteTag>();

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  /** Déplié par « + N autres ». */
  protected readonly expanded = signal(false);
  /** Le nombre de pastilles que la bande repliée montre ; `null` : tout tient, ou on mesure. */
  protected readonly cut = signal<number | null>(null);
  /** Vrai entre « montrer tout » et la lecture des boîtes. */
  protected readonly measuring = signal(true);
  private readonly width = signal(0);

  protected readonly searching = computed(() => this.palette.search().trim() !== '');

  /** Les résultats, l'armé et le filtre en tête quand on ne cherche pas. */
  protected readonly ordered = computed<readonly PaletteTag[]>(() => {
    const shown = this.palette.shown();
    if (this.searching()) {
      return shown;
    }
    const armed = this.palette.armed();
    return pinFirst(shown, armed === null ? this.filterTags() : [armed, ...this.filterTags()]);
  });

  protected readonly folds = computed(
    () => !this.searching() && !this.expanded() && !this.measuring() && this.cut() !== null,
  );

  protected readonly visible = computed(() => {
    const cut = this.cut();
    return this.folds() && cut !== null ? this.ordered().slice(0, cut) : this.ordered();
  });

  protected readonly hidden = computed(() => this.ordered().length - this.visible().length);

  /** Pendant la mesure, le bouton porte le plus long libellé possible. */
  protected readonly toggleCount = computed(() =>
    this.measuring() ? this.ordered().length : this.hidden(),
  );

  protected readonly resultLabel = computed(() =>
    this.palette.shown().length === 1 ? 'mot-clé' : 'mots-clés',
  );

  constructor() {
    // Remesurer quand la liste ou la largeur change : on montre tout un
    // rendu, on lit les boîtes, on coupe.
    effect(() => {
      this.ordered();
      this.width();
      this.expanded();
      untracked(() => this.measuring.set(true));
    });
    afterRenderEffect(() => {
      if (!this.measuring()) {
        return;
      }
      const layout = this.searching() || this.expanded() ? null : this.readLayout();
      this.cut.set(layout === null ? null : foldCut(layout));
      this.measuring.set(false);
    });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((records) => {
        const next = Math.round(records[0]?.contentRect.width ?? 0);
        // La LARGEUR seule : la hauteur change à chaque repli, et l'écouter
        // ferait remesurer en boucle.
        if (next !== this.width()) {
          this.width.set(next);
        }
      });
      afterRenderEffect(() => {
        const element = this.list()?.nativeElement;
        observer.disconnect();
        if (element !== undefined) {
          observer.observe(element);
        }
      });
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  /** La géométrie de la liste, toutes pastilles rendues — cf. {@link layoutOf}. */
  protected readLayout(): FoldLayout | null {
    const list = this.list()?.nativeElement;
    return list === undefined ? null : layoutOf(list);
  }

  protected submit(): void {
    this.palette.submitSearch();
  }

  protected create(): void {
    this.palette.createFromSearch();
  }

  protected clear(): void {
    this.palette.search.set('');
  }

  protected toggleExpanded(): void {
    this.expanded.update((open) => !open);
  }

  /** Le glisser-déposer transporte le MOT, pas un index : la bande peut être
   *  refiltrée entre la prise et le relâché. */
  protected carry(event: DragEvent, tag: string): void {
    event.dataTransfer?.setData('text/plain', tag);
  }
}
