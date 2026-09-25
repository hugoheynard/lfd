import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import {
  activeCarousel,
  type Cell,
  describeFormat,
  FORMATS,
  formatSpec,
  GRID_COLUMNS,
  MAX_ROWS,
  mediaFitOf,
  mediaSideOf,
  MIN_ROWS,
  type StorefrontShape,
} from '@lfd/storefront-layout';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import type { HasPendingChanges } from '../../pim/catalogue/product-form/pending-changes.guard';
import { type EditorBlock, itemsOf, toneOf } from '../storefront-block';
import { PointerDrag } from '../storefront-drag';
import { StorefrontEditorStore } from '../storefront-editor.store';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';
import { StorefrontMobilePreview } from '../storefront-mobile-preview/storefront-mobile-preview';
import { StorefrontObjectDialog } from '../storefront-object-dialog/storefront-object-dialog';
import type { StorefrontObjectDialogData } from '../storefront-object-host';
import { StorefrontPersistence } from '../storefront-persistence';
import { checkAcross, placeAcross } from '../storefront-placement';
import { cellAtPoint } from '../storefront-pointer';
import {
  blockFromTemplate,
  type StorefrontTemplate,
  type TemplateLabel,
} from '../storefront-templates';
import { StorefrontTemplateList } from '../storefront-template-list/storefront-template-list';

/** Les flèches du clavier, en pas de grille. */
const ARROW_STEPS: Readonly<Record<string, Cell>> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
};

/**
 * L'éditeur « Vitrine » — composer, rayon par rayon, une grille de 5 colonnes
 * × R rangées en y glissant des FORMES ; sous la dernière rangée, le reste du
 * rayon s'écoule en cartes.
 *
 * La composition vit dans {@link StorefrontEditorStore}, son aller-retour avec
 * le serveur dans {@link StorefrontPersistence} ; ce composant n'en garde que
 * la VUE.
 *
 * La règle de placement vit dans `@lfd/storefront-layout` ; ce composant ne
 * fait que traduire le pointeur et le clavier en cases.
 */
@Component({
  selector: 'app-storefront-page',
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    StorefrontMediaMock,
    StorefrontTemplateList,
    StorefrontMobilePreview,
  ],
  providers: [StorefrontEditorStore, StorefrontPersistence],
  templateUrl: './storefront-page.html',
  styleUrl: './storefront-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp($event)',
    '(window:pointercancel)': 'cancelDrag()',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class StorefrontPage implements HasPendingChanges {
  protected readonly store = inject(StorefrontEditorStore);
  protected readonly persistence = inject(StorefrontPersistence);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly columns = GRID_COLUMNS;
  protected readonly minRows = MIN_ROWS;
  protected readonly maxRows = MAX_ROWS;
  protected readonly describe = describeFormat;
  protected readonly spec = formatSpec;
  /** Ce que la maquette simule : rien pour un seul contenu, même avec des réglages gardés. */
  protected readonly carouselOf = activeCarousel;
  protected readonly sideOf = mediaSideOf;
  protected readonly fitOf = mediaFitOf;
  protected readonly toneOf = toneOf;
  protected readonly formats = FORMATS;

  /** L'écriture : sans elle, on compose pour voir, et rien ne part. */
  protected readonly canWrite = this.persistence.canWrite;

  /**
   * Une sortie a été retenue : la seconde passe (cf. {@link canLeave}). Remise à
   * `false` à chaque vitrine chargée ou enregistrée — `baseline` notifie alors
   * toujours, même à l'identique.
   */
  protected readonly leaveWarned = linkedSignal(() => {
    this.store.baseline();
    return false;
  });

  /** Le choix du rayon : les rayons servis, puis les disparus, qu'on peut encore regarder. */
  protected readonly shelfOptions = computed(() => [
    ...this.store.shelves().map((shelf) => ({ value: shelf.key, label: shelf.label })),
    ...this.store.vanished().map((key) => ({ value: key, label: `${key} — rayon disparu` })),
  ]);

  /** Ce que le champ demande ; la grille ne le suit que si rien ne déborde. Remis au rayon changé. */
  protected readonly requestedRows = linkedSignal<number | null>(() => this.store.rows());

  private readonly dragging = new PointerDrag();
  protected readonly drag = this.dragging.state;
  /** Le renommage, tel que la liste l'appelle : elle se ferme sur `true`. */
  protected readonly renamer = (id: string, label: TemplateLabel): boolean =>
    this.store.updateTemplate(id, label);

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  /** L'aperçu du glisser : où l'objet tomberait, et s'il y a le droit — sur TOUS ses rayons. */
  protected readonly preview = computed(() => {
    const drag = this.drag();
    if (drag === null || !drag.moved || drag.target === null) {
      return null;
    }
    const candidate: EditorBlock = {
      id: drag.blockId ?? '',
      format: drag.format,
      ...drag.target,
      shelves: this.store.shelvesOf(drag.blockId),
    };
    return {
      ...candidate,
      verdict: checkAcross(this.store.blocks(), this.store.rowsOf, candidate),
    };
  });

  constructor() {
    void this.persistence.load();
  }

  /**
   * Retient la première sortie quand des modifications attendent — la bannière
   * le dit ; la seconde passe. Sans droit d'écrire, rien ne se perd : on sort.
   */
  canLeave(): boolean {
    if (!this.store.dirty() || !this.canWrite() || this.leaveWarned()) {
      return true;
    }
    this.leaveWarned.set(true);
    return false;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty() && this.canWrite()) {
      event.preventDefault();
    }
  }

  protected onRowsChange(value: number | null): void {
    this.requestedRows.set(value);
    if (value === null || !Number.isInteger(value) || value < MIN_ROWS || value > MAX_ROWS) {
      return;
    }
    this.store.setRows(value);
  }

  protected onBlockKeydown(event: KeyboardEvent, id: string): void {
    const step = ARROW_STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      this.store.select(id);
      this.store.moveSelected(step.column, step.row);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.store.remove(id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.openEditor(id);
    } else if (event.key === 'Escape') {
      this.store.selectedId.set(null);
    }
  }

  /**
   * Ouvre le dialogue CENTRÉ de l'objet — double-clic, Entrée ou « Modifier ».
   * Un clic seul ne fait que sélectionner : on déplace sans ouvrir. Le dialogue
   * reçoit le store comme `host` : il en lit la sélection et lui renvoie ses intentions.
   *
   * ⚠️ Centré à toutes les largeurs : sous 900 px, la consigne voulait le plein
   * écran, et fold n'en a pas (`FoldPanelConfig` n'offre que des côtés et des
   * largeurs, vérifié dans `fold-ng.d.ts` le 2026-09-24). La feuille du bas
   * reste sous l'en-tête, ce n'en est pas un. Le dialogue s'y met donc en pile,
   * aperçu en haut, dans la largeur que fold lui laisse.
   */
  openEditor(id: string): void {
    this.store.select(id);
    this.store.notice.set(null);
    this.panels.open<StorefrontObjectDialogData>(StorefrontObjectDialog, {
      data: { host: this.store },
    });
  }

  /** Ce que la maquette d'un objet écrit : le nom de son premier contenu, s'il en a un. */
  protected contentLabel(block: EditorBlock): string | null {
    const [first] = itemsOf(block);
    if (first === undefined) {
      return null;
    }
    if (first.kind === 'product') {
      return this.store.productNames().get(first.sku) ?? first.sku;
    }
    return first.title.fr.trim() === '' ? 'Info sans titre' : first.title.fr;
  }

  /** Un de ses articles n'est plus en vente : la boutique ne le montrera pas. */
  protected hasUnserved(block: EditorBlock): boolean {
    return (
      this.store.catalog() !== null &&
      itemsOf(block).some(
        (item) => item.kind === 'product' && !this.store.productNames().has(item.sku),
      )
    );
  }

  protected isShared(block: EditorBlock): boolean {
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

  protected startBlockDrag(event: PointerEvent, block: EditorBlock): void {
    const cell = this.cellAt(event);
    const grab =
      cell === null
        ? { column: 0, row: 0 }
        : { column: cell.column - block.column, row: cell.row - block.row };
    this.store.select(block.id);
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
    const store = this.store;
    if (!drag.moved) {
      // Un appui sans glisser : poser à la première place (palette), ou sélectionner (déjà fait).
      if (drag.template !== null) {
        store.addTemplate(drag.template);
      } else if (drag.blockId === null) {
        store.addFormat(drag.format);
      }
      return;
    }
    if (origin === null) {
      return; // Lâché hors de la grille : rien ne bouge.
    }
    const shelves = store.shelvesOf(drag.blockId);
    const moved = store.blocks().find((block) => block.id === drag.blockId);
    const candidate: EditorBlock =
      moved !== undefined
        ? { ...moved, ...origin }
        : drag.template !== null
          ? blockFromTemplate(drag.template, store.newId(), origin, shelves)
          : { id: store.newId(), format: drag.format, ...origin, shelves };
    store.commit(placeAcross(store.blocks(), store.rowsOf, candidate), drag.blockId === null);
  }

  protected cancelDrag(): void {
    this.dragging.cancel();
  }

  private cellAt(event: PointerEvent): Cell | null {
    const element = this.grid()?.nativeElement;
    if (element === undefined) {
      return null;
    }
    return cellAtPoint(
      element.getBoundingClientRect(),
      this.store.rows(),
      event.clientX,
      event.clientY,
    );
  }
}
