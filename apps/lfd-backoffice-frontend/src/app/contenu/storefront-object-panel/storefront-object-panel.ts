import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldElementTitleComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { StorefrontContent } from '@lfd/contracts';
import {
  activeCarousel,
  allowedSides,
  type CarouselNav,
  type CarouselSettings,
  type ContentsMode,
  contentsOf,
  describeFormat,
  FIRST_SECONDS,
  FORMATS,
  hasMobileOption,
  INTERVAL_SECONDS,
  type MediaFit,
  mediaFitOf,
  type MediaSide,
  mediaSideOf,
  SAMPLE_COUNT,
  type ShelfKey,
  STOREFRONT_TONES,
  type StorefrontShape,
  type StorefrontTone,
  toneApplies,
} from '@lfd/storefront-layout';

import { type EditorBlock, itemsOf, toneOf } from '../storefront-block';
import type { ShelfOption, StorefrontCatalog } from '../storefront-catalog';
import { StorefrontContentsEditor } from '../storefront-contents-editor/storefront-contents-editor';

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

const TONE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'accent', label: 'Accent' },
];

function isTone(value: string): value is StorefrontTone {
  return (STOREFRONT_TONES as readonly string[]).includes(value);
}

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
 * Les réglages de l'objet sélectionné, en quatre sections l'une sous l'autre :
 * « Forme et image », « Rayons », « Contenus », « Mobile et défilement ». Il
 * vit dans le dialogue de l'objet, qui défile à côté de son aperçu fixe.
 *
 * Il ne tient AUCUN état de l'éditeur : il traduit chaque choix en une
 * intention typée, que l'éditeur applique — ou refuse, et le dit. Son seul
 * état d'affichage est le choix « Une sélection » de rayons, remis à zéro
 * quand la sélection change.
 */
@Component({
  selector: 'app-storefront-object-panel',
  imports: [
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldViewToggleComponent,
    StorefrontContentsEditor,
  ],
  templateUrl: './storefront-object-panel.html',
  styleUrl: './storefront-object-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontObjectPanel {
  readonly block = input.required<EditorBlock>();
  /** Le rayon édité : « ce rayon seulement », et la case qu'on ne décoche pas. */
  readonly shelf = input.required<ShelfKey>();
  /** Les rayons qu'on peut cocher — ceux du catalogue, « Tout » en tête. */
  readonly shelves = input.required<readonly ShelfOption[]>();
  /** Le catalogue d'administration ; `null` s'il n'a pas pu être lu. */
  readonly catalog = input<StorefrontCatalog | null>(null);

  readonly applyOnMobileChange = output<boolean>();
  readonly mediaChange = output<{ readonly fit?: MediaFit; readonly side?: MediaSide }>();
  readonly formatChange = output<StorefrontShape>();
  readonly toneChange = output<StorefrontTone>();
  readonly contentsChange = output<ContentsMode>();
  readonly carouselChange = output<Partial<CarouselSettings>>();
  readonly shelvesChange = output<readonly ShelfKey[]>();
  readonly itemsChange = output<readonly StorefrontContent[]>();

  protected readonly describe = describeFormat;
  protected readonly hasMobileOption = hasMobileOption;
  protected readonly fitOf = mediaFitOf;
  protected readonly sideOf = mediaSideOf;
  protected readonly contentsOf = contentsOf;
  /** Les réglages du défilement ne s'éditent qu'en plusieurs contenus. */
  protected readonly carouselOf = activeCarousel;
  protected readonly fitOptions = FIT_OPTIONS;
  protected readonly toneOptions = TONE_OPTIONS;
  /** Les sept formes, telles que la palette les nomme. */
  protected readonly formatOptions = FORMATS.map((spec) => ({
    value: spec.format,
    label: describeFormat(spec.format),
  }));
  protected readonly toneOf = toneOf;
  protected readonly contentsOptions = CONTENTS_OPTIONS;
  protected readonly navOptions = NAV_OPTIONS;
  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly firstBounds = FIRST_SECONDS;
  protected readonly intervalBounds = INTERVAL_SECONDS;
  protected readonly sampleBounds = SAMPLE_COUNT;

  /** « Une sélection » a été choisie : on montre les cases même si la liste dit encore autre chose. */
  private readonly pickingShelves = linkedSignal({
    source: () => this.block().id,
    computation: () => false,
  });

  /**
   * Le ton se propose-t-il ? Non sur une carte qui ne porte que des produits :
   * elle garde le rendu standard du rayon (D3), et proposer un réglage sans
   * effet serait mentir sur l'écran.
   */
  protected readonly toneShown = computed(() =>
    toneApplies(this.block().format, itemsOf(this.block())),
  );

  /** Les côtés que la forme permet — et eux seuls. */
  protected readonly sideOptions = computed<readonly FoldViewToggleOption[]>(() =>
    allowedSides(this.block().format).map((side) => ({ value: side, label: SIDE_LABELS[side] })),
  );

  protected readonly selectedScope = computed<ShelfScope>(() => {
    const block = this.block();
    if (this.pickingShelves()) {
      return 'some';
    }
    const all = this.allShelfKeys();
    if (all.length > 1 && all.every((key) => block.shelves.includes(key))) {
      return 'all';
    }
    return block.shelves.length === 1 && block.shelves[0] === this.shelf() ? 'this' : 'some';
  });

  private readonly allShelfKeys = computed(() => this.shelves().map((shelf) => shelf.key));

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

  protected onToneChange(value: string): void {
    if (isTone(value)) {
      this.toneChange.emit(value);
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
      this.shelvesChange.emit(this.allShelfKeys());
    }
  }

  /** Coche ou décoche un rayon. Le rayon édité reste coché : sinon l'objet quitterait la page qu'on regarde. */
  protected toggleShelf(shelf: ShelfKey, checked: boolean): void {
    const current = this.block().shelves;
    const next = checked ? [...current, shelf] : current.filter((key) => key !== shelf);
    // L'ordre du catalogue ; un rayon disparu qu'il portait encore reste, à la fin.
    const known = this.allShelfKeys();
    this.shelvesChange.emit([
      ...known.filter((key) => next.includes(key)),
      ...next.filter((key) => !known.includes(key)),
    ]);
  }
}
