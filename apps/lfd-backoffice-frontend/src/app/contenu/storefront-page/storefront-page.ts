import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  signal,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import {
  type Cell,
  checkPlacement,
  checkRowLimit,
  DEFAULT_ROWS,
  describeFormat,
  firstFreeCell,
  FORMATS,
  formatSpec,
  freeCells,
  GRID_COLUMNS,
  MAX_ROWS,
  MIN_ROWS,
  moveBy,
  onShelf,
  place,
  type PlacedBlock,
  type PlacementResult,
  refusalMessage,
  removeBlock,
  setShelves,
  type ShelfKey,
  type StorefrontShape,
} from '../storefront-grid';
import {
  type MediaFit,
  mediaFitOf,
  type MediaSide,
  mediaSideOf,
  setMedia,
  setTone,
  type Tone,
  toneOf,
} from '../storefront-media';
import {
  activeCarousel,
  type CarouselSettings,
  type ContentsMode,
  setCarousel,
  setContents,
} from '../storefront-carousel';
import { setApplyOnMobile } from '../storefront-mobile';
import { cellAtPoint } from '../storefront-pointer';
import { shelfLabel, STOREFRONT_SHELVES } from '../storefront-shelves';
import {
  blockFromTemplate,
  createTemplate,
  deleteTemplate,
  placeTemplate,
  type StorefrontTemplate,
  type TemplateLabel,
  type TemplateResult,
  updateTemplateLabel,
} from '../storefront-templates';
import { PointerDrag } from '../storefront-drag';
import { reshape } from '../storefront-reshape';
import { EXAMPLE_BLOCKS } from '../storefront-example';
import { StorefrontTemplateList } from '../storefront-template-list/storefront-template-list';
import { StorefrontObjectPanel } from '../storefront-object-panel/storefront-object-panel';
import { StorefrontMobilePreview } from '../storefront-mobile-preview/storefront-mobile-preview';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';

/** Les flèches du clavier, en pas de grille. */
const ARROW_STEPS: Readonly<Record<string, Cell>> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
};

/**
 * L'éditeur de page « Vitrine » — composer, rayon par rayon, une grille de 5
 * colonnes × R rangées en y glissant des FORMES ; le contenu (produit ou
 * info) s'y associera plus tard. Sous la
 * dernière rangée, le reste du rayon s'écoule en cartes.
 *
 * 🔴 **État LOCAL seulement** : aucun appel serveur, aucun contrat, rien
 * d'enregistré, et des rayons DOUBLÉS (`../storefront-shelves.ts`). Il sert à
 * éprouver le geste avant d'écrire le modèle serveur
 * (`documentation/order/boutique-rayon-layout.md`, « Composer une page »).
 * Recharger l'onglet revient à l'exemple.
 *
 * R est UNE valeur pour tous les rayons : un objet partagé se tient à la même
 * position partout, et un R par rayon aurait fait vérifier ses bornes rayon
 * par rayon pour un gain que personne n'a demandé.
 *
 * La règle de placement vit dans `../storefront-grid.ts` (fonctions pures) ;
 * ce composant ne fait que traduire le pointeur et le clavier en cases.
 */
@Component({
  selector: 'app-storefront-page',
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    StorefrontMediaMock,
    StorefrontTemplateList,
    StorefrontObjectPanel,
    StorefrontMobilePreview,
  ],
  templateUrl: './storefront-page.html',
  styleUrl: './storefront-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp($event)',
    '(window:pointercancel)': 'cancelDrag()',
  },
})
export class StorefrontPage {
  protected readonly columns = GRID_COLUMNS;
  protected readonly minRows = MIN_ROWS;
  protected readonly maxRows = MAX_ROWS;
  protected readonly describe = describeFormat;
  protected readonly spec = formatSpec;
  protected readonly shelfLabel = shelfLabel;
  protected readonly shelfOptions = STOREFRONT_SHELVES.map((shelf) => ({
    value: shelf.key,
    label: shelf.label,
  }));
  /** Ce que la maquette simule : rien pour un seul contenu, même avec des réglages gardés. */
  protected readonly carouselOf = activeCarousel;
  protected readonly sideOf = mediaSideOf;
  protected readonly fitOf = mediaFitOf;
  protected readonly toneOf = toneOf;

  protected readonly formats = FORMATS;

  /** Ce que le champ demande ; la grille ne le suit que si rien ne déborde. */
  protected readonly requestedRows = signal<number | null>(DEFAULT_ROWS);
  readonly rows = signal(DEFAULT_ROWS);
  readonly shelf = signal<ShelfKey>('all');
  /** Tous les objets, de tous les rayons. */
  readonly blocks = signal<readonly PlacedBlock[]>(EXAMPLE_BLOCKS);
  readonly selectedId = signal<string | null>(null);
  /** Le dernier refus, dit en toutes lettres. */
  readonly notice = signal<string | null>(null);
  protected readonly isExample = signal(true);
  private readonly dragging = new PointerDrag();
  protected readonly drag = this.dragging.state;
  /** Les gabarits — en mémoire, perdus au rechargement (cf. `storefront-templates.ts`). */
  readonly templates = signal<readonly StorefrontTemplate[]>([]);
  /** L'enregistrement, tel que le panneau l'appelle : son formulaire se ferme sur `true`. */
  protected readonly templateSaver = (label: TemplateLabel): boolean =>
    this.saveSelectedAsTemplate(label);
  /** Le renommage, tel que la liste l'appelle : elle se ferme sur `true`. */
  protected readonly renamer = (id: string, label: TemplateLabel): boolean =>
    this.updateTemplate(id, label);
  private nextId = 1;

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  /** Les objets de la page éditée. */
  readonly pageBlocks = computed(() => onShelf(this.blocks(), this.shelf()));

  /**
   * Les cases libres, en ordre de lecture : le reste du rayon s'y range, dans
   * l'ordre du catalogue. Montrées, jamais éditables.
   */
  readonly freeCells = computed(() => freeCells(this.pageBlocks(), this.rows()));

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.pageBlocks().find((block) => block.id === id) ?? null;
  });

  /** L'aperçu du glisser : où l'objet tomberait, et s'il y a le droit — sur TOUS ses rayons. */
  protected readonly preview = computed(() => {
    const drag = this.drag();
    if (drag === null || !drag.moved || drag.target === null) {
      return null;
    }
    const candidate: PlacedBlock = {
      id: drag.blockId ?? '',
      format: drag.format,
      ...drag.target,
      shelves: this.shelvesOf(drag.blockId),
    };
    return { ...candidate, verdict: checkPlacement(this.blocks(), this.rows(), candidate) };
  });

  // ── Rayon et rangées ───────────────────────────────────────────────────

  pickShelf(shelf: ShelfKey): void {
    this.shelf.set(shelf);
    this.selectedId.set(null);
    this.notice.set(null);
  }

  protected onRowsChange(value: number | null): void {
    this.requestedRows.set(value);
    if (value === null || !Number.isInteger(value) || value < MIN_ROWS || value > MAX_ROWS) {
      return;
    }
    this.setRows(value);
  }

  /** Réduire sous un objet posé — sur n'importe quel rayon — est refusé, en le nommant. */
  setRows(rows: number): boolean {
    const verdict = checkRowLimit(this.blocks(), rows);
    if (!verdict.ok) {
      const { blocker } = verdict;
      this.notice.set(
        `Impossible de passer à ${rows} rangée${rows > 1 ? 's' : ''} : « ${describeFormat(blocker.format)} » ` +
          `(${this.shelvesText(blocker)}, colonne ${blocker.column}, rangée ${blocker.row}) dépasserait. ` +
          `Déplacez-le ou retirez-le d’abord — la grille reste à ${this.rows()} rangées.`,
      );
      return false;
    }
    this.rows.set(rows);
    this.notice.set(null);
    return true;
  }

  // ── Poser, déplacer, retirer ───────────────────────────────────────────

  /** Voie clavier (et clic) de la palette : la première case libre du rayon édité. */
  addFormat(format: StorefrontShape): void {
    const shelves = [this.shelf()];
    const cell = firstFreeCell(this.blocks(), this.rows(), format, shelves);
    if (cell === null) {
      this.notice.set(`Plus aucune place pour « ${describeFormat(format)} » sur ce rayon.`);
      return;
    }
    this.commit(
      place(this.blocks(), this.rows(), { id: this.newId(), format, ...cell, shelves }),
      true,
    );
  }

  /** Un gabarit se pose comme une forme : à la première place libre du rayon édité. */
  addTemplate(template: StorefrontTemplate): void {
    const result = placeTemplate(this.blocks(), this.rows(), template, this.newId(), [
      this.shelf(),
    ]);
    if (!result.ok && result.reason === 'full') {
      this.notice.set(`Plus aucune place pour le gabarit « ${template.name} » sur ce rayon.`);
      return;
    }
    this.commit(result, true);
  }

  // ── Gabarits (en mémoire seulement) ────────────────────────────────────

  /** Enregistre l'objet sélectionné comme gabarit ; rend `false` si le nom est refusé. */
  saveSelectedAsTemplate(label: TemplateLabel): boolean {
    const block = this.selected();
    if (block === null) {
      return false;
    }
    return this.applyTemplates(
      createTemplate(this.templates(), block, `template-${this.nextId++}`, label),
    );
  }

  /** Renomme et/ou redécrit un gabarit ; les objets déjà posés n'en savent rien. */
  updateTemplate(id: string, label: TemplateLabel): boolean {
    return this.applyTemplates(updateTemplateLabel(this.templates(), id, label));
  }

  deleteTemplate(id: string): void {
    this.templates.update((templates) => deleteTemplate(templates, id));
  }

  private applyTemplates(result: TemplateResult): boolean {
    if (!result.ok) {
      this.notice.set(`Refusé : ${result.message}`);
      return false;
    }
    this.templates.set(result.templates);
    this.notice.set(null);
    return true;
  }

  moveSelected(deltaColumn: number, deltaRow: number): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(moveBy(this.blocks(), this.rows(), id, deltaColumn, deltaRow), false);
    }
  }

  /** Retirer, c'est retirer de TOUS ses rayons : l'objet est un seul objet. */
  remove(id: string): void {
    this.blocks.update((blocks) => removeBlock(blocks, id));
    this.isExample.set(false);
    this.notice.set(null);
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }
  }

  protected clearAll(): void {
    this.blocks.set([]);
    this.selectedId.set(null);
    this.isExample.set(false);
    this.notice.set(null);
  }

  protected onBlockKeydown(event: KeyboardEvent, id: string): void {
    const step = ARROW_STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      this.select(id);
      this.moveSelected(step.column, step.row);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(id);
    } else if (event.key === 'Escape') {
      this.selectedId.set(null);
    }
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  // ── Propriétés de la sélection ─────────────────────────────────────────

  setSelectedApplyOnMobile(value: boolean): void {
    const id = this.selectedId();
    if (id !== null) {
      this.blocks.update((blocks) => setApplyOnMobile(blocks, id, value));
      this.isExample.set(false);
    }
  }

  setSelectedMedia(media: { readonly fit?: MediaFit; readonly side?: MediaSide }): void {
    const id = this.selectedId();
    if (id !== null) {
      this.blocks.update((blocks) => setMedia(blocks, id, media));
      this.isExample.set(false);
    }
  }

  /** Change la forme ; refusé (et dit) si la nouvelle taille ne tient pas sur un de ses rayons. */
  setSelectedFormat(format: StorefrontShape): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(reshape(this.blocks(), this.rows(), id, format), false);
    }
  }

  setSelectedTone(tone: Tone): void {
    const id = this.selectedId();
    if (id !== null) {
      this.blocks.update((blocks) => setTone(blocks, id, tone));
      this.isExample.set(false);
    }
  }

  setSelectedContents(value: ContentsMode): void {
    const id = this.selectedId();
    if (id !== null) {
      this.blocks.update((blocks) => setContents(blocks, id, value));
      this.isExample.set(false);
    }
  }

  /** Une valeur hors bornes est refusée et dite ; le réglage précédent reste. */
  setSelectedCarousel(patch: Partial<CarouselSettings>): void {
    const id = this.selectedId();
    if (id === null) {
      return;
    }
    const result = setCarousel(this.blocks(), id, patch);
    if (!result.ok) {
      this.notice.set(`Refusé : ${result.message}`);
      return;
    }
    this.blocks.set(result.blocks);
    this.isExample.set(false);
    this.notice.set(null);
  }

  setSelectedShelves(shelves: readonly ShelfKey[]): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(setShelves(this.blocks(), this.rows(), id, shelves), false);
    }
  }

  protected isShared(block: PlacedBlock): boolean {
    return block.shelves.length > 1;
  }

  // ── Glisser (pointeur : souris ET tactile) ─────────────────────────────

  protected startPaletteDrag(event: PointerEvent, format: StorefrontShape): void {
    this.dragging.start(event, { format, template: null, blockId: null }, { column: 0, row: 0 });
  }

  protected startTemplateDrag(event: PointerEvent, template: StorefrontTemplate): void {
    this.dragging.start(
      event,
      { format: template.format, template, blockId: null },
      { column: 0, row: 0 },
    );
  }

  protected startBlockDrag(event: PointerEvent, block: PlacedBlock): void {
    const cell = this.cellAt(event);
    const grab =
      cell === null
        ? { column: 0, row: 0 }
        : { column: cell.column - block.column, row: cell.row - block.row };
    this.select(block.id);
    this.dragging.start(event, { format: block.format, template: null, blockId: block.id }, grab);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.drag() !== null) {
      this.dragging.move(event, this.cellAt(event));
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const finished = this.dragging.finish(this.cellAt(event));
    if (finished === null) {
      return;
    }
    const { drag, origin } = finished;
    if (!drag.moved) {
      // Un appui sans glisser : poser à la première place (palette), ou sélectionner (déjà fait).
      if (drag.template !== null) {
        this.addTemplate(drag.template);
      } else if (drag.blockId === null) {
        this.addFormat(drag.format);
      }
      return;
    }
    if (origin === null) {
      return; // Lâché hors de la grille : rien ne bouge.
    }
    const shelves = this.shelvesOf(drag.blockId);
    const moved = this.blocks().find((block) => block.id === drag.blockId);
    const candidate: PlacedBlock =
      moved !== undefined
        ? { ...moved, ...origin }
        : drag.template !== null
          ? blockFromTemplate(drag.template, this.newId(), origin, shelves)
          : { id: this.newId(), format: drag.format, ...origin, shelves };
    this.commit(place(this.blocks(), this.rows(), candidate), drag.blockId === null);
  }

  protected cancelDrag(): void {
    this.dragging.cancel();
  }

  /** Les rayons d'un objet déplacé, ou le rayon édité pour un objet neuf. */
  private shelvesOf(blockId: string | null): readonly ShelfKey[] {
    const block =
      blockId === null ? undefined : this.blocks().find((candidate) => candidate.id === blockId);
    return block?.shelves ?? [this.shelf()];
  }

  private shelvesText(block: PlacedBlock): string {
    return block.shelves.map((key) => `« ${shelfLabel(key)} »`).join(', ');
  }

  private cellAt(event: PointerEvent): Cell | null {
    const element = this.grid()?.nativeElement;
    if (element === undefined) {
      return null;
    }
    return cellAtPoint(element.getBoundingClientRect(), this.rows(), event.clientX, event.clientY);
  }

  private commit(result: PlacementResult, selectNew: boolean): void {
    if (!result.ok) {
      this.notice.set(`Refusé : ${refusalMessage(result, this.rows(), shelfLabel)}`);
      return;
    }
    this.blocks.set(result.blocks);
    this.isExample.set(false);
    this.notice.set(null);
    const last = result.blocks.at(-1);
    if (selectNew && last !== undefined) {
      this.select(last.id);
    }
  }

  private newId(): string {
    return `block-${this.nextId++}`;
  }
}
