import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';

import {
  climbTargetOf,
  countOf,
  focusOf,
  hasChildren,
  type LevelState,
  levelIdsOf,
  levelState,
  pathOf,
  ROOT_LEVEL,
  type ShelfEntry,
  shelfTreeOf,
} from '../shelf-tree';
import { byData, centre } from './shelf-nav-dom';
import type { CatalogShelfNavLabels, ChipView, LevelView, ShelfCounted } from './shelf-nav.model';

/** Le délai d'entrée de la première pastille, puis l'écart entre deux (SPEC §5.3). */
const CHIP_DELAY_MS = 140;
const CHIP_STEP_MS = 38;
/** Le rattrapage après la fin des transitions et le chargement des polices (SPEC §4). */
const SETTLE_MS = 460;

/**
 * **Le rail des rayons**, partagé par la boutique et la saisie de commande du
 * staff (2026-11-03) — une seule définition de « Plonger » pour les deux fronts.
 *
 * Il ne sait rien de ce qu'est un rayon pour l'écran qui le monte : il reçoit
 * la liste à afficher (`shelves`, dans l'ordre), les ids qui sont des familles
 * — elles seules portent un compte —, les articles à compter et ses mots.
 * Chaque front construit sa liste : la boutique y met « Tout », la mise en
 * avant et les opérations, la saisie « Tout » et les familles.
 *
 * 🔴 **Il ne sait rien de la recherche**, et c'est délibéré. Chercher traverse
 * les rayons, donc aucune pastille n'est active pendant une recherche — mais
 * c'est un fait de la PAGE, qui arbitre entre les deux questions. Elle le dit en
 * passant `active` à `null` ; le rail se contente d'allumer ce qu'on lui
 * désigne. Lui apprendre le terme cherché lui aurait donné une seconde raison de
 * changer.
 *
 * **Familles imbriquées : « Plonger »** (handoff du 2026-10-29). Dès qu'un rayon
 * servi a une parente, le rail devient UNE rangée par niveau, tous montés et
 * empilés ; seul le niveau affiché est visible. Son état `cur` / `left` /
 * `right` (`levelState`) donne seul la direction du mouvement, tout en CSS.
 * Un catalogue plat garde le rail d'avant, à l'identique.
 */
@Component({
  selector: 'lfd-catalog-shelf-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': "appearance() === 'compact'" },
  templateUrl: './shelf-nav.html',
  styleUrl: './shelf-nav.scss',
})
export class CatalogShelfNav {
  /** Les pastilles, dans l'ordre : celles qui ne sont pas des familles y sont des racines. */
  readonly shelves = input.required<readonly ShelfEntry[]>();
  /** Les ids qui sont des familles — elles seules portent un compte. */
  readonly families = input.required<ReadonlySet<string>>();
  /** Les articles, pour compter le sous-arbre de chaque famille. */
  readonly items = input.required<readonly ShelfCounted[]>();
  /** La pastille « tout voir » : où remonte un niveau de tête, et le début du fil. */
  readonly allId = input.required<string>();
  readonly labels = input.required<CatalogShelfNavLabels>();
  /** Le rayon allumé, ou `null` — une recherche n'en désigne aucun. */
  readonly active = input<string | null>(null);
  /**
   * `shop` : le rail de la boutique, inchangé. `compact` (2026-11-03, Hugo) :
   * la STRUCTURE de la boutique — pastille de retour et son compte, chevron,
   * fil d'Ariane, séparateur, changement de niveau — sous la PEAU du
   * back-office : taille `sm`, sélection en teinte d'accent, sans indicateur
   * glissant ni entrée en cascade. Le gabarit est le même ; seule la feuille
   * diffère (`:host(.compact)`).
   */
  readonly appearance = input<'shop' | 'compact'>('shop');

  /** Un rayon choisi. La page en tire ce qu'elle veut : filtrer, et oublier le terme. */
  readonly picked = output<string>();

  private readonly rails = viewChildren<ElementRef<HTMLElement>>('rail');
  private readonly stage = viewChildren<ElementRef<HTMLElement>>('stage');

  /**
   * Le niveau quitté par un geste DU RAIL, en attente du rendu qui déplacera le
   * focus (SPEC §8). `null` : rien à déplacer — un changement venu de la page
   * (adresse, recherche) ne vole pas le focus.
   */
  private pendingFrom: string | null = null;
  /** Le premier placement de l'indicateur est sans transition. */
  private placed = false;

  /** L'arbre des rayons : les pastilles qui ne sont pas des familles y sont des racines. */
  private readonly tree = computed(() => shelfTreeOf(this.shelves()));

  /** Vrai dès qu'une famille a une parente : le rail plonge. */
  protected readonly nested = computed(() => this.tree().nested);

  /** Le niveau affiché. */
  private readonly focus = computed(() => focusOf(this.tree(), this.active()));

  protected readonly levels = computed<readonly LevelView[]>(() => {
    const tree = this.tree();
    const focus = this.focus();
    return levelIdsOf(tree).map((id) => this.levelOf(id, levelState(tree, id, focus)));
  });

  constructor() {
    afterRenderEffect(() => {
      this.levels();
      this.placeIndicators(!this.placed);
      this.placed = true;
      this.moveFocus();
    });
    this.settleAfterRender();
  }

  /** Choisir une pastille, depuis le rail. */
  protected pick(id: string): void {
    if (id !== this.active()) {
      this.pendingFrom = this.focus();
    }
    this.picked.emit(id);
  }

  /** Échap dans un niveau imbriqué : remonter d'un cran (SPEC §8). */
  protected climb(): void {
    const level = this.levels().find((entry) => entry.state === 'cur');
    if (level?.nested === true) {
      this.pick(level.climbTo);
    }
  }

  private levelOf(id: string, state: LevelState): LevelView {
    const tree = this.tree();
    const c = this.labels();
    const cur = state === 'cur';
    const node = tree.nodes.get(id);
    const entries = node === undefined ? tree.roots : [id, ...node.children];
    const chips = entries.map((chipId, index) =>
      this.chipOf(chipId, chipId === id ? c.all : null, cur ? index : null),
    );
    const parent =
      node?.parentId === null || node === undefined ? null : tree.nodes.get(node.parentId);
    const label = node?.label ?? '';
    return {
      id,
      state,
      nested: node !== undefined,
      top: node !== undefined && node.parentId === null,
      label,
      ariaLabel: node === undefined ? c.group : c.level(label),
      count: countOf(tree, id, this.items()),
      climbTo: climbTargetOf(tree, id, this.allId()),
      climbLabel: parent === undefined || parent === null ? c.climbToRoot : c.climbTo(parent.label),
      crumbs: [
        { id: this.allId(), label: c.root },
        ...pathOf(tree, id)
          .slice(0, -1)
          .map((ancestor) => ({ id: ancestor, label: tree.nodes.get(ancestor)?.label ?? '' })),
      ],
      chips,
    };
  }

  /** `self` : le libellé « Tout » de la pastille qui est la famille elle-même. */
  private chipOf(id: string, self: string | null, index: number | null): ChipView {
    const tree = this.tree();
    const node = tree.nodes.get(id);
    const drill = self === null && hasChildren(tree, id);
    const label = self ?? node?.label ?? '';
    return {
      id,
      label,
      count: this.families().has(id) ? countOf(tree, id, this.items()) : null,
      on: this.active() === id,
      drill,
      ariaLabel: drill ? this.labels().withChildren(label, node?.children.length ?? 0) : null,
      delay: index === null ? 0 : CHIP_DELAY_MS + index * CHIP_STEP_MS,
    };
  }

  /**
   * L'indicateur de chaque rail vise la pastille allumée (SPEC §4). `offsetLeft`
   * ignore le `transform` d'entrée : il vise d'emblée la place finale.
   */
  private placeIndicators(instant: boolean): void {
    for (const { nativeElement: rail } of this.rails()) {
      const indicator = rail.querySelector<HTMLElement>('.indicator');
      if (indicator === null) {
        continue;
      }
      const chip = rail.querySelector<HTMLElement>('.chip.on');
      if (instant) {
        indicator.style.transition = 'none';
      }
      if (chip === null) {
        indicator.style.setProperty('--shown', '0');
      } else {
        indicator.style.width = `${chip.offsetWidth}px`;
        indicator.style.transform = `translateX(${chip.offsetLeft}px)`;
        indicator.style.setProperty('--shown', '1');
        centre(rail, chip);
      }
      if (instant) {
        void indicator.offsetWidth;
        indicator.style.transition = '';
      }
    }
  }

  /** Après une plongée, la pastille de tête ; après une remontée, la pastille d'où l'on vient. */
  private moveFocus(): void {
    const from = this.pendingFrom;
    this.pendingFrom = null;
    const to = this.focus();
    const stage = this.stage()[0]?.nativeElement;
    if (from === null || from === to || stage === undefined) {
      return;
    }
    const level = byData(stage, '.level', 'level', to);
    const tree = this.tree();
    const climbed = to === ROOT_LEVEL || pathOf(tree, from).includes(to);
    // En remontant, la pastille du niveau atteint qui menait au niveau quitté —
    // le fil d'Ariane peut sauter plusieurs crans.
    const target = climbed
      ? [...pathOf(tree, from)]
          .reverse()
          .map((id) => (level === null ? null : byData(level, '.chip', 'shelf', id)))
          .find((chip) => chip !== null)
      : level?.querySelector<HTMLElement>('.pill');
    (target ?? level?.querySelector<HTMLElement>('.chip.on'))?.focus();
  }

  /**
   * Le rattrapage : une image plus tard, puis à la fin des transitions et des
   * polices ; et sans transition à chaque redimensionnement d'un rail.
   */
  private settleAfterRender(): void {
    const destroyRef = inject(DestroyRef);
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    afterRenderEffect(() => {
      this.levels();
      if (typeof requestAnimationFrame === 'undefined') {
        return;
      }
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = requestAnimationFrame(() => this.placeIndicators(false));
      timer = setTimeout(() => this.placeIndicators(false), SETTLE_MS);
      if (observer === undefined && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => this.placeIndicators(true));
      }
      observer?.disconnect();
      for (const rail of this.rails()) {
        observer?.observe(rail.nativeElement);
      }
    });
    destroyRef.onDestroy(() => {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(frame);
      }
      clearTimeout(timer);
      observer?.disconnect();
    });
  }
}
