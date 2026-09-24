import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldNumberInputComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  activeCarousel,
  type CarouselNav,
  type CarouselSettings,
  type ContentsMode,
  contentsOf,
  FIRST_SECONDS,
  INTERVAL_SECONDS,
  SAMPLE_COUNT,
} from '../storefront-carousel';
import { describeFormat, type PlacedBlock, type ShelfKey } from '../storefront-grid';
import {
  allowedSides,
  type MediaFit,
  mediaFitOf,
  type MediaSide,
  mediaSideOf,
} from '../storefront-media';
import { hasMobileOption } from '../storefront-mobile';
import { STOREFRONT_SHELVES } from '../storefront-shelves';
import type { TemplateLabel } from '../storefront-templates';
import { TemplateNameForm } from '../template-name-form/template-name-form';

const SIDE_LABELS: Readonly<Record<MediaSide, string>> = {
  left: 'Gauche',
  right: 'Droite',
  top: 'Haut',
  full: 'Plein',
};

const FIT_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'cover', label: 'Remplir' },
  { value: 'contain', label: 'Contenir' },
];

const CONTENTS_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'single', label: 'Un seul' },
  { value: 'multiple', label: 'Plusieurs' },
];

const NAV_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'dots', label: 'Points' },
  { value: 'arrows', label: 'Flèches' },
  { value: 'both', label: 'Les deux' },
];

/** La portée d'un objet, telle que le panneau la propose. */
type ShelfScope = 'this' | 'some' | 'all';

const SCOPE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'this', label: 'Ce rayon seulement' },
  { value: 'some', label: 'Une sélection' },
  { value: 'all', label: 'Tous les rayons' },
];

const ALL_SHELF_KEYS: readonly ShelfKey[] = STOREFRONT_SHELVES.map((shelf) => shelf.key);

type CarouselNumberField = 'intervalSeconds' | 'firstSeconds' | 'sampleCount';

function isFit(value: string): value is MediaFit {
  return value === 'cover' || value === 'contain';
}

function isContentsMode(value: string): value is ContentsMode {
  return value === 'single' || value === 'multiple';
}

function isNav(value: string): value is CarouselNav {
  return value === 'dots' || value === 'arrows' || value === 'both';
}

function isScope(value: string): value is ShelfScope {
  return value === 'this' || value === 'some' || value === 'all';
}

/**
 * Le panneau de l'objet sélectionné dans l'éditeur « Vitrine » : image,
 * option mobile, un ou plusieurs contenus, rayons, et « Enregistrer comme
 * gabarit ».
 *
 * Il ne tient AUCUN état de l'éditeur : il traduit chaque choix en une
 * intention typée, que l'éditeur applique — ou refuse, et le dit. Seuls deux
 * états d'affichage lui sont propres, remis à zéro quand la sélection change :
 * le choix « Une sélection » de rayons, et le formulaire de nom du gabarit.
 * Ce dernier passe par `saveTemplate`, fourni par l'éditeur, qui tient la
 * liste et juge l'unicité — le formulaire ne se ferme que sur `true`.
 */
@Component({
  selector: 'app-storefront-object-panel',
  imports: [
    FoldButtonComponent,
    FoldCheckboxComponent,
    FoldNumberInputComponent,
    FoldViewToggleComponent,
    TemplateNameForm,
  ],
  templateUrl: './storefront-object-panel.html',
  styleUrl: './storefront-object-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontObjectPanel {
  readonly block = input.required<PlacedBlock>();
  /** Le rayon édité : « ce rayon seulement », et la case qu'on ne décoche pas. */
  readonly shelf = input.required<ShelfKey>();
  readonly saveTemplate = input.required<(label: TemplateLabel) => boolean>();

  readonly applyOnMobileChange = output<boolean>();
  readonly mediaChange = output<{ readonly fit?: MediaFit; readonly side?: MediaSide }>();
  readonly contentsChange = output<ContentsMode>();
  readonly carouselChange = output<Partial<CarouselSettings>>();
  readonly shelvesChange = output<readonly ShelfKey[]>();

  protected readonly describe = describeFormat;
  protected readonly hasMobileOption = hasMobileOption;
  protected readonly fitOf = mediaFitOf;
  protected readonly sideOf = mediaSideOf;
  protected readonly contentsOf = contentsOf;
  /** Les réglages du défilement ne s'éditent qu'en plusieurs contenus. */
  protected readonly carouselOf = activeCarousel;
  protected readonly shelves = STOREFRONT_SHELVES;
  protected readonly fitOptions = FIT_OPTIONS;
  protected readonly contentsOptions = CONTENTS_OPTIONS;
  protected readonly navOptions = NAV_OPTIONS;
  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly firstBounds = FIRST_SECONDS;
  protected readonly intervalBounds = INTERVAL_SECONDS;
  protected readonly sampleBounds = SAMPLE_COUNT;

  /** Le formulaire de nom du gabarit — refermé quand la sélection change. */
  protected readonly naming = linkedSignal({
    source: () => this.block().id,
    computation: () => false,
  });
  /** « Une sélection » a été choisie : on montre les cases même si la liste dit encore autre chose. */
  private readonly pickingShelves = linkedSignal({
    source: () => this.block().id,
    computation: () => false,
  });

  /** Les côtés que la forme permet — et eux seuls. */
  protected readonly sideOptions = computed<readonly FoldViewToggleOption[]>(() =>
    allowedSides(this.block().format).map((side) => ({ value: side, label: SIDE_LABELS[side] })),
  );

  protected readonly selectedScope = computed<ShelfScope>(() => {
    const block = this.block();
    if (this.pickingShelves()) {
      return 'some';
    }
    if (block.shelves.length === ALL_SHELF_KEYS.length) {
      return 'all';
    }
    return block.shelves.length === 1 && block.shelves[0] === this.shelf() ? 'this' : 'some';
  });

  protected onTemplateNamed(label: TemplateLabel): void {
    if (this.saveTemplate()(label)) {
      this.naming.set(false);
    }
  }

  protected onFitChange(value: string): void {
    if (isFit(value)) {
      this.mediaChange.emit({ fit: value });
    }
  }

  protected onSideChange(value: string): void {
    const side = allowedSides(this.block().format).find((candidate) => candidate === value);
    if (side !== undefined) {
      this.mediaChange.emit({ side });
    }
  }

  protected onContentsChange(value: string): void {
    if (isContentsMode(value)) {
      this.contentsChange.emit(value);
    }
  }

  protected onNavChange(value: string): void {
    if (isNav(value)) {
      this.carouselChange.emit({ nav: value });
    }
  }

  protected onSecondsChange(field: CarouselNumberField, value: number | null): void {
    if (value !== null) {
      this.carouselChange.emit({ [field]: value });
    }
  }

  protected onScopeChange(value: string): void {
    if (!isScope(value)) {
      return;
    }
    this.pickingShelves.set(value === 'some');
    if (value === 'this') {
      this.shelvesChange.emit([this.shelf()]);
    } else if (value === 'all') {
      this.shelvesChange.emit(ALL_SHELF_KEYS);
    }
  }

  /** Coche ou décoche un rayon. Le rayon édité reste coché : sinon l'objet quitterait la page qu'on regarde. */
  protected toggleShelf(shelf: ShelfKey, checked: boolean): void {
    const current = this.block().shelves;
    const next = checked ? [...current, shelf] : current.filter((key) => key !== shelf);
    this.shelvesChange.emit(ALL_SHELF_KEYS.filter((key) => next.includes(key)));
  }
}
