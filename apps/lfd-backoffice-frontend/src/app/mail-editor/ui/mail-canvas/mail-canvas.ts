import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  isEditablePhrase,
  MAIL_LOCALES,
  MODEL_SECTION_LABELS,
  validateMailDocument,
  type ColumnsBlock,
  type ColumnWidthStep,
  type FreeBlock,
  type MailBlock,
  type MailDocument,
  type MailDocumentViolation,
  type MailEditorResources,
  type MailEditorFrame,
  type MailEditorPhrasePlace,
  type MailLocale,
  type MailTemplateDeclaration,
  type ModelSectionId,
} from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import {
  appendToCell,
  CALLOUT_TONE_LABELS,
  findEditableBlock,
  FREE_BLOCK_LABELS,
  insertBlockAfter,
  isInColumn,
  libraryItemKeyOf,
  type LibraryItemKey,
  moveBlockBy,
  newCellBlock,
  newLibraryBlock,
  removeBlock,
  replaceFreeBlock,
  setColumnWidth,
  setColumnWidths,
  withText,
} from '../../rules/mail-document-edits';
import {
  type BlockContainer,
  type BlockOrigin,
  type BlockSlot,
  cellListIds,
  destinationValueOf,
  draggedBlockId,
  fitsInCell,
  FLOW,
  moveBlock,
  moveDestinations,
  narrowsImage,
  slotOf,
} from '../../rules/mail-block-moves';
import { insertChipAt, variableChip } from '../../rules/mail-editable-text';
import {
  absenceLabel,
  CONDITION_BADGE,
  conditionsByBlock,
} from '../../rules/mail-block-conditions';
import { freeBlockFallback, phrasePathsIn } from '../../rules/mail-fragments';
import { samePlace } from '../../rules/mail-phrase-places';
import {
  EMPTY_MAIL_RESOURCES,
  labelValueChip,
  valueCardsByName,
  valueRefusal,
} from '../../rules/mail-resources';
import { MailBlockPreviewsStore } from '../../state/mail-block-previews-store';
import { type PointerPoint, pointerOverColumns } from '../../rules/mail-columns-drop-zone';
import { MailPhrasesStore } from '../../state/mail-phrases-store';
import {
  type FreeBlockInput,
  MailBlockFragment,
  type PhraseInput,
} from '../mail-block-fragment/mail-block-fragment';
import { MailBlockLibrary } from '../mail-block-library/mail-block-library';
import {
  type CellAddition,
  type ColumnWidthChoice,
  MailBlockSettings,
} from '../mail-block-settings/mail-block-settings';
import { type CellBlockStep, MailColumnsCells } from '../mail-columns-cells/mail-columns-cells';
import { MailColumnGuides } from '../mail-column-guides/mail-column-guides';
import { MailInsertBar } from '../mail-insert-bar/mail-insert-bar';
import { MailResourcesPanel } from '../mail-resources-panel/mail-resources-panel';

let nextBlockListId = 0;

/** Le dernier bloc retiré : « Annuler » rend le document d'avant, tant que rien d'autre n'a changé. */
interface Removal {
  readonly title: string;
  readonly before: MailDocument;
  readonly after: MailDocument;
}

/**
 * **Le canevas de l'éditeur d'e-mails : l'e-mail lui-même** (plan
 * `plan-editeur-par-blocs.md`, § 22, S5f, sur la maquette validée par Hugo
 * le 2026-11-07).
 *
 * Au milieu, l'e-mail à sa largeur, composé des fragments du serveur
 * (`MailBlockPreviewsStore`) : en-tête, blocs, pied. Chaque bloc montre
 * toujours son cadre (pointillé, marqué au survol et à la sélection), une
 * poignée à glisser et — bloc libre seulement — une croix qui le retire,
 * annulable ; au clavier, Alt + flèche le déplace (retouche de Hugo du
 * 2026-11-07, sans boutons « monter / descendre »). Le sélectionner ouvre
 * ses réglages à droite. On écrit sur place : une phrase part en
 * brouillon (`MailPhrasesStore`, dans la langue RENDUE), le texte d'un bloc
 * libre change le document. À gauche, l'objet et les ressources de
 * l'e-mail (§ 24, R2 : valeurs à glisser dans une phrase qui les reçoit,
 * liens et blocs de données à repérer) ; à droite, la bibliothèque (ajout
 * sous le bloc sélectionné) et les réglages. Le bouton du modèle porte ses
 * pastilles de lien ; un bouton ajouté, son adresse dans une pastille qui
 * ouvre ses réglages.
 *
 * Les refus du document sont ceux de `validateMailDocument`, ceux d'une
 * phrase ceux du serveur — aucune règle n'est recopiée ici.
 */
@Component({
  selector: 'app-mail-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    MailBlockFragment,
    MailBlockLibrary,
    MailBlockSettings,
    MailColumnGuides,
    MailColumnsCells,
    MailInsertBar,
    MailResourcesPanel,
  ],
  templateUrl: './mail-canvas.html',
  styleUrl: './mail-canvas.scss',
  host: {
    '(document:selectionchange)': 'rememberCaret()',
    '(document:pointermove)': 'trackPointer($event)',
  },
})
export class MailCanvas {
  readonly document = input.required<MailDocument>();
  readonly declaration = input.required<MailTemplateDeclaration>();
  /** La clé du modèle ouvert — la règle refuse un document d'un autre modèle. */
  readonly template = input.required<string>();
  /** La langue de l'e-mail affiché ; la page la choisit parmi celles du modèle. */
  readonly locale = input.required<MailLocale>();
  readonly canWrite = input(false);
  /** Les ressources de l'e-mail (`MailEditorView.resources`, § 24). */
  readonly resources = input<MailEditorResources>(EMPTY_MAIL_RESOURCES);
  /** Fabrique l'identifiant d'un bloc neuf ; remplaçable en test. */
  readonly newId = input<() => string>(() => crypto.randomUUID());
  readonly documentChange = output<MailDocument>();
  /** Le rendu a échoué sans rien à montrer : la page le redemande. */
  readonly retry = output<void>();
  /**
   * Le bloc du modèle ou le cadre (objet, en-tête) sélectionné : la page
   * projette ses phrases — toutes ses variantes, celles que le cas ne montre
   * pas comprises — dans la colonne de droite (`[focusPanel]`).
   */
  readonly focus = model<MailEditorPhrasePlace | null>(null);

  protected readonly phrases = inject(MailPhrasesStore);
  protected readonly previews = inject(MailBlockPreviewsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);

  /**
   * L'identifiant de la liste des blocs : la bibliothèque s'y connecte pour
   * qu'une carte s'y dépose. Le fil et les cellules des colonnes reçoivent —
   * l'en-tête et le pied n'en sont pas, et n'affichent donc jamais de barre.
   */
  protected readonly blockListId = `mail-canvas-blocks-${nextBlockListId++}`;
  protected readonly flow: BlockContainer = FLOW;

  /** Les listes des cellules de toutes les mises en page. */
  protected readonly cellLists = computed(() => [
    ...cellListIds(this.document(), this.blockListId),
  ]);
  /**
   * Où une carte ou un bloc d'une cellule peut tomber : les cellules D'ABORD,
   * le fil ensuite — CDK prend la première liste sous le pointeur, et une
   * cellule est aussi dans le fil qui la contient.
   */
  protected readonly dropTargets = computed(() => [...this.cellLists(), this.blockListId]);

  /** Un glisser qu'une cellule accepte est en cours : les cellules vides s'ouvrent. */
  protected readonly cellDragActive = signal(false);
  /** Un glisser de bloc ou de carte est en cours : les poignées de colonnes laissent passer. */
  protected readonly dragInProgress = signal(false);
  /**
   * Le pointeur pendant un glisser — `pointermove` part avant le `mousemove`
   * que CDK écoute, il est donc à jour quand CDK interroge les prédicats du
   * fil. `null` au départ d'un glisser.
   */
  private pointer: PointerPoint | null = null;

  /**
   * Le fil ne reçoit pas, et ne trie pas, tant que le pointeur vise une mise
   * en page de colonnes : c'est la cellule sous lui qui reçoit
   * (`pointerOverColumns`, symptôme du 2026-11-08).
   */
  protected readonly flowAccepts = (): boolean => !this.overColumns();
  protected readonly flowMaySort = (): boolean => !this.overColumns();
  /** La cellule vide choisie : la bibliothèque y ajoute au clic. */
  protected readonly selectedCell = signal<{
    readonly columnsId: string;
    readonly cell: number;
  } | null>(null);
  /** Ce que le dernier dépôt a changé de lui-même, dit sous l'e-mail. */
  protected readonly dropNotice = signal<string | null>(null);

  /**
   * Une cellule ne reçoit ni mise en page, ni bloc du modèle : refusés à
   * l'entrée, ils ne montrent ni barre ni aperçu.
   */
  protected readonly acceptsInCell = (drag: CdkDrag): boolean => {
    const key = libraryItemKeyOf(drag.data);
    if (key !== null) {
      return key !== 'columns-2' && key !== 'columns-3';
    }
    const id = draggedBlockId(drag.data);
    const slot = id === null ? null : slotOf(this.document(), id);
    const block = slot === null ? null : this.blockIn(slot);
    return block !== null && fitsInCell(block);
  };

  /** Le bloc libre ou la mise en page sélectionné. */
  protected readonly selectedId = signal<string | null>(null);
  /** Le dernier curseur posé dans une phrase : une variable choisie au clavier s'y insère. */
  private caret: Range | null = null;

  protected readonly modelLabels = MODEL_SECTION_LABELS;

  /** La langue dans laquelle le serveur a rendu (repli compris) : c'est celle qu'on réécrit. */
  protected readonly renderedLocale = computed(() => this.previews.view()?.locale ?? this.locale());

  /** Les phrases que l'éditeur laisse écrire (`declaration.editablePhrases`, § 23 ; toutes sans liste). */
  private readonly editablePhrases = computed(() =>
    this.phrases.phrases().filter((phrase) => isEditablePhrase(this.declaration(), phrase.path)),
  );

  protected readonly phrasePaths = computed(
    () => new Set(this.editablePhrases().map((phrase) => phrase.path)),
  );

  /** Le dernier retrait, que « Annuler » défait. */
  protected readonly removal = signal<Removal | null>(null);

  protected readonly freeBlockIds = computed(() => {
    const ids = new Set<string>();
    for (const block of this.document().blocks) {
      if (block.kind === 'columns') {
        block.cells.flat().forEach((inner) => ids.add(inner.id));
      } else if (block.kind !== 'model') {
        ids.add(block.id);
      }
    }
    return ids;
  });

  /** Les fiches des valeurs, par nom technique. */
  protected readonly valueCards = computed(() => valueCardsByName(this.resources()));
  /** Les valeurs qu'au moins une phrase modifiable reçoit. */
  protected readonly placeableValues = computed(() => {
    const editable = this.phrasePaths();
    return new Set(
      this.resources()
        .values.filter((value) => value.phrases.some((path) => editable.has(path)))
        .map((value) => value.name),
    );
  });
  /** Les valeurs qu'une phrase modifiable exige. */
  protected readonly requiredValues = computed(
    () => new Set(this.editablePhrases().flatMap((phrase) => phrase.requiredVariables)),
  );
  /** Le dernier dépôt de valeur refusé, dit sous les ressources. */
  protected readonly valueRefusal = signal<string | null>(null);
  /** Le bloc du modèle qu'une ressource survolée éclaire. */
  protected readonly litSection = signal<ModelSectionId | null>(null);

  protected readonly violations = computed<readonly MailDocumentViolation[]>(() =>
    validateMailDocument(this.document(), this.declaration(), this.template()),
  );
  /** Les refus qu'aucun bloc ne porte : sans bloc, ou d'un bloc absent du canevas. */
  protected readonly documentViolations = computed(() => {
    const document = this.document();
    return this.violations().filter(
      (violation) =>
        violation.blockId === null ||
        (!document.blocks.some((block) => block.id === violation.blockId) &&
          findEditableBlock(document, violation.blockId) === null),
    );
  });
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id === null ? null : findEditableBlock(this.document(), id);
  });
  /** Les blocs posés dans la mise en page sélectionnée, colonne par colonne. */
  protected readonly selectedCells = computed(() => {
    const block = this.selected();
    return block?.kind === 'columns' ? block.cells : [];
  });
  /** Les pastilles de lien du bouton du modèle : il se calcule à l'envoi, l'éditeur le nomme. */
  protected readonly modelLinks = computed(() => this.resources().links);
  protected readonly librarySubtitle = computed(() => {
    if (this.selectedCell() !== null) {
      return 'Clic : dans la colonne choisie — ou glissez la carte à sa place';
    }
    return this.anchorId() === null
      ? 'Clic : à la fin de l’e-mail — ou glissez la carte à sa place'
      : 'Clic : sous le bloc sélectionné — ou glissez la carte à sa place';
  });

  /** « Déplacer vers… » du bloc sélectionné : le geste clavier du glisser. */
  protected readonly destinations = computed(() => {
    const id = this.selectedId();
    return id === null ? [] : moveDestinations(this.document(), id);
  });
  protected readonly destinationOptions = computed(() =>
    this.destinations().map(({ value, label }) => ({ value, label })),
  );
  protected readonly currentDestination = computed(() => {
    const id = this.selectedId();
    const slot = id === null ? null : slotOf(this.document(), id);
    return slot === null ? null : destinationValueOf(slot.container);
  });

  /** Le bloc sous lequel la bibliothèque ajoute. */
  private readonly anchorId = computed(() => {
    const selected = this.selectedId();
    if (selected !== null) {
      return selected;
    }
    const place = this.focus();
    if (place?.kind !== 'block') {
      return null;
    }
    return (
      this.document().blocks.find(
        (block) => block.kind === 'model' && block.section === place.block,
      )?.id ?? null
    );
  });

  protected readonly conditionBadge = CONDITION_BADGE;
  /** Les conditions d'affichage des blocs de données (§ 24), par bloc du modèle. */
  private readonly conditions = computed(() => conditionsByBlock(this.resources()));

  /** La condition d'affichage d'un bloc du modèle ; `null` s'il s'affiche toujours. */
  protected conditionOf(block: MailBlock): string | null {
    return block.kind === 'model' ? (this.conditions().get(block.section) ?? null) : null;
  }

  /**
   * « Absent pour une livraison » : un bloc sous condition que la situation
   * rendue écarte (fragment vide) ; `null` sinon. Le bloc reste à l'écran,
   * grisé, pour qu'on puisse encore le déplacer.
   */
  protected absenceOf(block: MailBlock, html: string | null): string | null {
    const situation = this.previews.view()?.situation ?? null;
    return situation !== null && html === '' && this.conditionOf(block) !== null
      ? absenceLabel(situation)
      : null;
  }

  /**
   * Les refus d'un bloc ; pour une mise en page, aussi ceux des blocs rangés
   * dans ses colonnes, chacun nommé par sa colonne et son bloc — sans quoi ils
   * ne s'affichaient nulle part.
   */
  protected violationsOf(block: MailBlock): readonly string[] {
    const own = this.violations()
      .filter((violation) => violation.blockId === block.id)
      .map((violation) => violation.message);
    if (block.kind !== 'columns') {
      return own;
    }
    const inner = block.cells.flatMap((cell, column) =>
      cell.flatMap((cellBlock) =>
        this.violations()
          .filter((violation) => violation.blockId === cellBlock.id)
          .map(
            (violation) =>
              `Colonne ${column + 1} · ${this.titleOf(cellBlock)} : ${violation.message}`,
          ),
      ),
    );
    return [...own, ...inner];
  }

  /** Les refus du serveur sur les phrases que ce fragment montre, dans la langue rendue. */
  protected phraseRefusalsOf(html: string | null): readonly string[] {
    if (html === null) {
      return [];
    }
    const locale = this.renderedLocale();
    return phrasePathsIn(html).flatMap((path) => {
      const phrase = this.phrases.phrases().find((candidate) => candidate.path === path);
      const refusal = phrase === undefined ? null : this.phrases.refusalOf(phrase, locale);
      return refusal === null ? [] : [refusal];
    });
  }

  /** Une phrase de ce fragment a été réécrite par quelqu'un d'autre pendant la frappe. */
  protected hasConflict(html: string | null): boolean {
    return html !== null && phrasePathsIn(html).some((path) => this.phrases.conflicts().has(path));
  }

  /**
   * Le fragment d'un bloc : celui du serveur ; pour un bloc libre que le
   * serveur ne rend pas encore (texte vide, bouton sans adresse), sa zone
   * d'écriture ; `null` tant qu'aucun rendu ne l'a vu.
   */
  protected fragmentOf(block: MailBlock): string | null {
    const html = this.previews.fragments().get(block.id);
    if (html === undefined) {
      return null;
    }
    if (html === '' && block.kind !== 'model' && block.kind !== 'columns') {
      return freeBlockFallback(block, this.renderedLocale()) ?? '';
    }
    return html;
  }

  protected titleOf(block: MailBlock): string {
    switch (block.kind) {
      case 'model':
        return MODEL_SECTION_LABELS[block.section];
      case 'callout':
        return `${FREE_BLOCK_LABELS.callout} · ${CALLOUT_TONE_LABELS[block.tone]}`;
      case 'columns':
        return `${block.cells.length} colonnes`;
      default:
        return FREE_BLOCK_LABELS[block.kind];
    }
  }

  /** Le nom d'un bloc dans son cadre : « Titre · du modèle », « Paragraphe · bloc libre ». */
  protected nameOf(block: MailBlock): string {
    return `${this.titleOf(block)} · ${block.kind === 'model' ? 'du modèle' : 'bloc libre'}`;
  }

  /** Le nom de la poignée : le geste à la souris et celui du clavier. */
  protected handleLabelOf(block: MailBlock): string {
    return `Déplacer le bloc « ${this.titleOf(block)} » : glisser la poignée, ou Alt + flèche haut / bas sur le bloc`;
  }

  protected hasSettings(block: FreeBlock | ColumnsBlock): boolean {
    return (
      block.kind === 'button' ||
      block.kind === 'image' ||
      block.kind === 'callout' ||
      block.kind === 'columns'
    );
  }

  /**
   * Une image pleine largeur du fil : son cadre sort des marges du corps,
   * bord à bord de la carte, comme dans l'e-mail.
   */
  protected isFullWidth(block: MailBlock): boolean {
    return block.kind === 'image' && block.width === 'full';
  }

  protected isInColumn(blockId: string): boolean {
    return isInColumn(this.document(), blockId);
  }

  protected isSelected(block: MailBlock): boolean {
    return block.kind === 'model'
      ? samePlace(this.focus(), { kind: 'block', block: block.section })
      : this.selectedId() === block.id;
  }

  protected isLit(block: MailBlock): boolean {
    return block.kind === 'model' && block.section === this.litSection();
  }

  protected isFrameSelected(frame: MailEditorFrame): boolean {
    return samePlace(this.focus(), { kind: 'frame', frame });
  }

  protected select(block: MailBlock): void {
    this.selectedCell.set(null);
    if (block.kind === 'model') {
      this.focus.set({ kind: 'block', block: block.section });
      this.selectedId.set(null);
    } else {
      this.selectedId.set(block.id);
      this.focus.set(null);
    }
  }

  protected selectInner(blockId: string): void {
    this.selectedCell.set(null);
    this.selectedId.set(blockId);
    this.focus.set(null);
  }

  protected selectFrame(frame: MailEditorFrame): void {
    this.selectedCell.set(null);
    this.focus.set({ kind: 'frame', frame });
    this.selectedId.set(null);
  }

  /** Entrée ou Espace sélectionne ; Alt + flèche déplace — le bloc garde le focus. */
  protected onBlockKeydown(event: KeyboardEvent, block: MailBlock): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(block);
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.move(block.id, event.key === 'ArrowUp' ? -1 : 1);
      this.refocus(block.id);
    }
  }

  protected onFrameKeydown(event: KeyboardEvent, frame: MailEditorFrame): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.selectFrame(frame);
    }
  }

  /**
   * Un dépôt, dans le fil ou dans une cellule : une carte de la bibliothèque
   * devient un bloc NEUF à la place de la barre ; un bloc y est déplacé, d'où
   * qu'il vienne. Une seule édition (`moveBlock`), une seule relecture.
   */
  protected dropped(event: CdkDragDrop<BlockContainer, BlockContainer, unknown>): void {
    this.cellDragActive.set(false);
    const container = event.container.data;
    const to: BlockSlot = { container, index: event.currentIndex };
    const key = libraryItemKeyOf(event.item.data);
    if (key !== null) {
      this.place(key, to);
      return;
    }
    const id = draggedBlockId(event.item.data);
    const from = id === null ? null : slotOf(this.document(), id);
    if (from !== null) {
      this.relocate(from, to);
    }
  }

  /** Un bloc du fil, tiré : les cellules vides ne s'ouvrent que s'il peut y entrer. */
  protected flowDragStarted(block: MailBlock): void {
    this.dragging(true);
    this.cellDragActive.set(fitsInCell(block));
  }

  protected libraryDragging(key: LibraryItemKey | null): void {
    this.dragging(key !== null);
    this.cellDragActive.set(key !== null && key !== 'columns-2' && key !== 'columns-3');
  }

  /** Un bloc de cellule, tiré puis lâché. */
  protected cellDragging(active: boolean): void {
    this.dragging(active);
    this.cellDragActive.set(active);
  }

  protected flowDragEnded(): void {
    this.dragging(false);
    this.cellDragActive.set(false);
  }

  protected trackPointer(event: PointerEvent): void {
    if (this.dragInProgress()) {
      this.pointer = { x: event.clientX, y: event.clientY };
    }
  }

  // Appelé AVANT que CDK interroge les listes au départ du glisser (`started`
  // précède `start()`) : sans pointeur connu, le fil reste une destination.
  private dragging(active: boolean): void {
    this.pointer = null;
    this.dragInProgress.set(active);
  }

  private overColumns(): boolean {
    const layouts = [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-columns-layout]'),
    ].map((element) => element.getBoundingClientRect());
    return pointerOverColumns(this.pointer, layouts);
  }

  /** Alt + flèche sur un bloc de colonne : un cran dans sa cellule. */
  protected cellStepped(step: CellBlockStep): void {
    const from = slotOf(this.document(), step.blockId);
    if (from === null || from.container.kind !== 'cell') {
      return;
    }
    const index = from.index + step.delta;
    const length = this.listLength(from.container);
    if (index >= 0 && index < length) {
      this.relocate(from, { container: from.container, index });
      this.refocusInner(step.blockId);
    }
  }

  /** « Déplacer vers… » : le bloc sélectionné va au bas de la colonne choisie, ou sous sa mise en page. */
  protected moveTo(value: string | null): void {
    const id = this.selectedId();
    const destination = this.destinations().find((candidate) => candidate.value === value);
    const from = id === null ? null : slotOf(this.document(), id);
    if (destination !== undefined && from !== null) {
      this.relocate(from, destination.slot);
    }
  }

  protected cellChosen(columnsId: string, cell: number): void {
    this.selectedId.set(null);
    this.focus.set(null);
    this.selectedCell.set({ columnsId, cell });
  }

  private relocate(from: BlockSlot, to: BlockSlot): void {
    const before = this.document();
    const block = this.blockIn(from);
    const next = moveBlock(before, from, to);
    if (block === null || next === before) {
      return;
    }
    this.emit(next);
    this.announceDrop(next, block, to.container);
  }

  /** Le dépôt, dit au lecteur d'écran ; la conversion d'une image, dite à tous. */
  private announceDrop(next: MailDocument, block: MailBlock, to: BlockContainer): void {
    const slot = slotOf(next, block.id);
    const position = slot === null ? 0 : slot.index + 1;
    const where =
      to.kind === 'cell'
        ? `dans la colonne ${String(to.cell + 1)}, position ${String(position)}`
        : `dans l’e-mail, position ${String(position)} sur ${String(next.blocks.length)}`;
    const narrowed = narrowsImage(block, to)
      ? 'Image passée dans le texte : une colonne n’a pas de bord de carte.'
      : null;
    this.dropNotice.set(narrowed);
    void this.announcer.announce(
      `Bloc « ${this.titleOf(block)} » déposé ${where}.${narrowed === null ? '' : ` ${narrowed}`}`,
      'polite',
    );
  }

  private blockIn(slot: BlockSlot): MailBlock | null {
    if (slot.container.kind === 'flow') {
      return this.document().blocks[slot.index] ?? null;
    }
    const { columnsId, cell } = slot.container;
    const columns = this.document().blocks.find((block) => block.id === columnsId);
    return columns?.kind === 'columns' ? (columns.cells[cell]?.[slot.index] ?? null) : null;
  }

  private listLength(container: BlockContainer): number {
    if (container.kind === 'flow') {
      return this.document().blocks.length;
    }
    const columns = this.document().blocks.find((block) => block.id === container.columnsId);
    return columns?.kind === 'columns' ? (columns.cells[container.cell]?.length ?? 0) : 0;
  }

  private move(blockId: string, delta: -1 | 1): void {
    this.emit(moveBlockBy(this.document(), blockId, delta));
  }

  /** Le clic (ou Entrée) sur une carte : sous le bloc sélectionné, sinon à la fin. */
  protected add(key: LibraryItemKey): void {
    this.place(key, null);
  }

  /**
   * La seule fabrique d'un bloc de la bibliothèque, pour le clic comme pour le
   * dépôt : à `to` s'il y en a une, sinon dans la cellule choisie, sinon sous
   * l'ancre — dans sa cellule si l'ancre est un bloc de colonne. Le bloc neuf
   * est sélectionné, et sa place annoncée — un lecteur d'écran ne voit pas la
   * barre.
   */
  private place(key: LibraryItemKey, to: BlockSlot | null): void {
    const block = newLibraryBlock(key, this.newId()());
    const before = this.document();
    const target = to ?? this.clickSlot(block);
    const origin: BlockOrigin = { added: block };
    const next =
      target === null
        ? insertBlockAfter(before, this.anchorId(), block)
        : moveBlock(before, origin, target);
    if (next === before) {
      return;
    }
    this.emit(next);
    this.selectedCell.set(null);
    this.selectedId.set(block.id);
    this.focus.set(null);
    const slot = slotOf(next, block.id);
    if (slot?.container.kind === 'cell') {
      this.announceDrop(next, block, slot.container);
      return;
    }
    const position = (slot?.index ?? 0) + 1;
    void this.announcer.announce(
      `Bloc « ${this.titleOf(block)} » ajouté, position ${position} sur ${next.blocks.length}. Ses réglages sont ouverts.`,
      'polite',
    );
  }

  /** La place d'un clic dans la bibliothèque, quand elle vise une colonne ; `null` pour le fil. */
  private clickSlot(block: FreeBlock | ColumnsBlock): BlockSlot | null {
    if (!fitsInCell(block)) {
      return null;
    }
    const cell = this.selectedCell();
    if (cell !== null) {
      const container: BlockContainer = { kind: 'cell', ...cell };
      return { container, index: this.listLength(container) };
    }
    const anchor = this.anchorId();
    const slot = anchor === null ? null : slotOf(this.document(), anchor);
    return slot?.container.kind === 'cell'
      ? { container: slot.container, index: slot.index + 1 }
      : null;
  }

  protected remove(block: MailBlock): void {
    if (this.selectedId() === block.id) {
      this.selectedId.set(null);
    }
    const before = this.document();
    const after = removeBlock(before, block.id);
    this.emit(after);
    if (after !== before) {
      this.removal.set({ title: this.titleOf(block), before, after });
    }
  }

  /** Remet le bloc retiré — seulement si le document n'a pas bougé depuis. */
  protected undoRemoval(): void {
    const removal = this.removal();
    this.removal.set(null);
    if (removal !== null && removal.after === this.document()) {
      this.documentChange.emit(removal.before);
    }
  }

  protected onPhraseInput(input: PhraseInput): void {
    const phrase = this.phrases.phrases().find((candidate) => candidate.path === input.path);
    if (phrase !== undefined && this.canWrite()) {
      this.valueRefusal.set(null);
      this.phrases.edit(phrase, this.renderedLocale(), input.text);
    }
  }

  protected onFreeBlockInput(input: FreeBlockInput): void {
    const block = findEditableBlock(this.document(), input.blockId);
    const locale = MAIL_LOCALES.find((candidate) => candidate === input.locale);
    if (block !== null && block.kind !== 'columns' && locale !== undefined && this.canWrite()) {
      this.edited(withText(block, locale, input.text));
    }
  }

  /** Garde le curseur posé dans une phrase modifiable du canevas. */
  protected rememberCaret(): void {
    const selection = this.host.nativeElement.ownerDocument.getSelection();
    const range = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range !== null && this.phraseZoneOf(range.startContainer) !== null) {
      this.caret = range.cloneRange();
    }
  }

  /**
   * Le geste clavier du glisser : une valeur choisie s'insère en pastille au
   * dernier curseur posé dans une phrase — si cette phrase la reçoit —, et la
   * phrase est relue. Sinon, le refus est dit.
   */
  protected insertVariable(name: string): void {
    const range = this.caret;
    const zone = range === null ? null : this.phraseZoneOf(range.startContainer);
    if (range === null || zone === null) {
      this.valueRefusal.set('Posez d’abord le curseur dans une phrase de l’e-mail.');
      return;
    }
    const refusal = valueRefusal(this.valueCards(), name, zone.getAttribute('data-phrase') ?? '');
    this.valueRefusal.set(refusal);
    if (refusal !== null) {
      return;
    }
    const chip = variableChip(zone.ownerDocument, name);
    insertChipAt(range, chip);
    labelValueChip(chip, this.valueCards());
    zone.dispatchEvent(new Event('input', { bubbles: true }));
  }

  protected onValueRefused(refusal: string): void {
    this.valueRefusal.set(refusal);
  }

  /** La pastille d'adresse d'un bouton ajouté ouvre ses réglages. */
  protected openButtonSettings(block: MailBlock): void {
    this.select(block);
  }

  protected edited(block: FreeBlock): void {
    this.emit(replaceFreeBlock(this.document(), block));
  }

  protected widthChosen(columnsId: string, choice: ColumnWidthChoice): void {
    this.emit(setColumnWidth(this.document(), columnsId, choice.columnIndex, choice.width));
  }

  /** Le lâcher d'une poignée (ou une touche) : toutes les largeurs, en une seule édition. */
  protected widthsDragged(columnsId: string, widths: readonly ColumnWidthStep[]): void {
    this.emit(setColumnWidths(this.document(), columnsId, widths));
  }

  protected cellAdded(columnsId: string, addition: CellAddition): void {
    const block = newCellBlock(addition.key, this.newId()());
    if (block !== null) {
      this.emit(appendToCell(this.document(), columnsId, addition.cellIndex, block));
    }
  }

  private phraseZoneOf(node: Node): Element | null {
    const element = node instanceof Element ? node : node.parentElement;
    const zone = element?.closest('[data-phrase][contenteditable]') ?? null;
    return zone !== null && this.host.nativeElement.contains(zone) ? zone : null;
  }

  private refocusInner(blockId: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`li[data-cell-block="${CSS.escape(blockId)}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private refocus(blockId: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`li[data-block="${CSS.escape(blockId)}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private emit(next: MailDocument): void {
    if (next !== this.document()) {
      this.removal.set(null);
      this.dropNotice.set(null);
      this.documentChange.emit(next);
    }
  }
}
