import { computed, type Signal, signal } from '@angular/core';
import type { HandoverQueueView, ProductionPackingView } from '@lfd/contracts';

import type { HandoverBoard } from './handover-slots';
import type { PackingBoard } from './packing-cards';
import type { PreparationBoard } from './preparation-shelves';
import {
  awaitedMatches,
  focusMatches,
  NO_MATCHES,
  type SupervisionFocus,
  type SupervisionMatches,
  supervisionMatches,
} from './supervision-search';
import { hitAt, hitCountsOf, hitsOf } from './supervision-hits';

/** Ce que la mise en avant lit — les vues brutes et les planches de la page. */
export interface HighlightSources {
  readonly packing: Signal<ProductionPackingView | null>;
  readonly handover: Signal<HandoverQueueView | null>;
  readonly preparationBoard: Signal<PreparationBoard | null>;
  readonly packingBoard: Signal<PackingBoard | null>;
  readonly handoverBoard: Signal<HandoverBoard | null>;
}

/**
 * **La mise en avant de la Supervision** (v2, A5) : trois sources, une seule à
 * la fois — la recherche, une pastille de blocage, une commande « attend le
 * four » dépliée. Chaque geste efface les deux autres, et la précédence
 * (recherche > pastille > dépliage) n'est qu'une ceinture.
 *
 * Sortie de la page pour la garder sous les 300 lignes ; aucun DOM ici — le
 * défilement est celui de la page.
 */
export class SupervisionHighlight {
  readonly query = signal('');
  readonly focus = signal<SupervisionFocus | null>(null);
  /** La référence de la commande dépliée. */
  readonly awaitedOpen = signal<string | null>(null);
  /** Le rang de ‹ n / m ›, non borné : `hitAt` le ramène dans la liste. */
  readonly hitCursor = signal(0);

  private readonly base = computed<SupervisionMatches>(() => {
    const s = this.sources;
    if (this.query().trim() !== '') {
      return supervisionMatches(this.query(), s.handover(), s.packing());
    }
    const focus = this.focus();
    if (focus !== null) {
      return focusMatches(focus, s.packing(), s.handover(), s.handoverBoard());
    }
    const awaited = this.awaitedOpen();
    return awaited === null ? NO_MATCHES : awaitedMatches(awaited, s.packing(), s.handover());
  });

  readonly hits = computed(() =>
    hitsOf(this.base(), {
      preparation: this.sources.preparationBoard(),
      packing: this.sources.packingBoard(),
      handover: this.sources.handoverBoard(),
    }),
  );
  readonly counts = computed(() => hitCountsOf(this.hits()));
  readonly current = computed(() => hitAt(this.hits(), this.hitCursor()));
  /** Une mise en avant est active — même si elle ne trouve rien. */
  readonly active = computed(() => this.base().mode !== null);
  /** « 2 / 7 », « 0 / 0 ». */
  readonly position = computed(() => {
    const current = this.current();
    return `${String(current === null ? 0 : current.index + 1)} / ${String(this.hits().length)}`;
  });

  /** L'interface commune aux trois colonnes, avec l'occurrence courante. */
  readonly matches = computed<SupervisionMatches>(() => ({
    ...this.base(),
    current: this.current()?.hit.key ?? null,
  }));

  constructor(private readonly sources: HighlightSources) {}

  /** La frappe : elle efface pastille et dépliage, et repart de la première occurrence. */
  search(query: string): void {
    this.query.set(query);
    this.focus.set(null);
    this.awaitedOpen.set(null);
    this.hitCursor.set(0);
  }

  /** Une pastille : re-cliquée, elle s'éteint. */
  toggleFocus(focus: SupervisionFocus): void {
    this.focus.update((current) => (current === focus ? null : focus));
    this.query.set('');
    this.awaitedOpen.set(null);
    this.hitCursor.set(0);
  }

  toggleAwaited(reference: string): void {
    this.awaitedOpen.update((current) => (current === reference ? null : reference));
    this.query.set('');
    this.focus.set(null);
    this.hitCursor.set(0);
  }

  step(delta: number): void {
    this.hitCursor.update((cursor) => cursor + delta);
  }

  /** ✕ : la recherche ET toute mise en avant. */
  clear(): void {
    this.search('');
  }
}
