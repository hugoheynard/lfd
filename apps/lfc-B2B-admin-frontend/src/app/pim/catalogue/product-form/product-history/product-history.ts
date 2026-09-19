import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  ProductHistoryEntryView,
  ProductHistoryInheritedKind,
  ProductHistoryPageView,
} from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPaginatorComponent,
  type FoldBadgeVariant,
  type FoldPaginatorLabels,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import type { DetailRow } from '../../../../shared/journal/detail-rows';
import { FactDetail } from '../../../../shared/journal/fact-detail/fact-detail';
import { FactSentence } from '../../../../shared/journal/fact-sentence/fact-sentence';
import { actorBy, type Segment } from '../../../../shared/journal/phrase';
import { renderFact } from '../../../../shared/journal/render-fact';
import { factWhen } from '../../../../shared/journal/units';
import { ProductHistoryHttpApi } from '../../product-history-http-api';

type LoadState = 'loading' | 'ready' | 'error';

/** Vingt faits par page : ce que le serveur prend par défaut, et ce qu'un onglet se lit. */
const PAGE_SIZE = 20;

/** Le paginator parle anglais par défaut ; cet onglet, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Faits par page',
  perPage: 'par page',
  nav: "Pagination de l'historique",
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucun fait',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/**
 * D'où vient un fait hérité, dit dans une phrase. Un `Record` exhaustif : une
 * sorte d'héritage ajoutée au contrat ne compile pas tant qu'elle n'a pas son
 * libellé ici.
 */
const INHERITED_FROM: Readonly<Record<ProductHistoryInheritedKind, (label: string) => string>> = {
  category: (label) => `Hérité de la famille ${label}`,
  vat_rate: (label) => `Hérité du taux ${label}`,
  ingredient: (label) => `Hérité de l’ingrédient ${label}`,
  appellation: (label) => `Hérité de l’appellation ${label}`,
};

/** Le repère d'un fait qui ne vient pas de la fiche elle-même. */
export interface CircleMark {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/** Une ligne de l'historique, telle que l'onglet la lit. */
export interface HistoryLine {
  readonly id: string;
  /** « Taux de « Réduit » passé de 5,5 % à 10 % » — la phrase du journal, en segments. */
  readonly segments: readonly Segment[];
  /** Tout ce que la phrase n'a pas dit de la charge (replié à l'écran). */
  readonly detail: readonly DetailRow[];
  /** « 21 août 2026 à 14:32 ». */
  readonly when: string;
  readonly actor: string;
  /** Vrai quand la phrase nomme déjà l'auteur : la méta ne répète pas « par … ». */
  readonly namesActor: boolean;
  /** `null` pour un fait de la fiche : c'est le cas courant, il ne se marque pas. */
  readonly mark: CircleMark | null;
  readonly type: string;
}

/**
 * Le repère de cercle d'un fait : rien pour la fiche, « Hérité de … » pour ce
 * qu'elle tient d'ailleurs, « Révision » pour une révision qui l'a emportée.
 */
export function circleMark(entry: ProductHistoryEntryView): CircleMark | null {
  switch (entry.circle) {
    case 'product':
      return null;
    case 'inherited':
      return {
        label: INHERITED_FROM[entry.inheritedFrom.kind](entry.inheritedFrom.label),
        variant: 'info',
      };
    case 'revision':
      return { label: 'Révision', variant: 'neutral' };
  }
}

/**
 * La phrase vient du moteur du journal (`shared/journal/render-fact.ts`) : le
 * Journal et cet onglet racontent un même fait avec les mêmes mots. L'auteur
 * sans nom se dit par sa NATURE — un nom absent n'est pas toujours le système.
 */
function toLine(entry: ProductHistoryEntryView): HistoryLine {
  const fact = renderFact(entry);
  return {
    id: entry.id,
    segments: fact.segments,
    detail: fact.detail,
    when: factWhen(entry.occurredAt),
    actor: actorBy(entry.actorName, null, entry.actorType),
    namesActor: fact.namesActor,
    mark: circleMark(entry),
    type: entry.type,
  };
}

/**
 * **L'onglet « Historique » d'une fiche produit** — tout ce qui l'a touchée,
 * du plus récent au plus ancien (plan `journalisation/plan-journal-d-activite.md`,
 * lot 3 amendé le 2026-09-19).
 *
 * Trois cercles dans une même chronologie : la fiche elle-même, ce dont elle
 * hérite (famille et ancêtres, taux, ingrédients, appellations), et les
 * révisions qui l'ont emportée. Seuls les deux derniers se marquent.
 *
 * Pages numérotées sur une **vue figée**, comme le journal : la page 1 part
 * sans ancre et reçoit `asOf`, que les pages suivantes renvoient. Une ancre
 * refusée (`400` : la fiche a changé de famille entre deux pages, ou le fait
 * n'est plus dans ses fils) rouvre la page 1 — l'instantané n'existe plus tel
 * quel, et le montrer autrement serait mentir.
 *
 * Les décisions du commerce sur les SKU ne sont pas ici : elles vivent sous les
 * droits du commerce, et l'onglet renvoie au journal filtré — seulement pour
 * qui peut le lire, sans quoi le lien mènerait à un `403`.
 */
@Component({
  selector: 'app-product-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FactDetail,
    FactSentence,
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPaginatorComponent,
  ],
  templateUrl: './product-history.html',
  styleUrl: './product-history.scss',
})
export class ProductHistory {
  private readonly api = inject(ProductHistoryHttpApi);
  private readonly permissions = inject(PermissionsStore);

  readonly productId = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly lines = signal<readonly HistoryLine[]>([]);
  /** La page affichée — celle que le serveur a rendue. */
  protected readonly page = signal(1);
  /** Les faits de la vue figée, toutes pages confondues. */
  protected readonly total = signal(0);
  /** Une page suivante est en lecture : la liste reste, le paginateur se fige. */
  protected readonly paging = signal(false);
  /** Une page suivante n'a pas pu être lue ; la précédente reste à l'écran. */
  protected readonly pageError = signal(false);
  /** « 14:32 » — l'heure à laquelle la page 1 a figé la vue. */
  protected readonly frozenAt = signal('');

  protected readonly pageSize = PAGE_SIZE;
  protected readonly paginatorLabels = PAGINATOR_LABELS;

  /**
   * Les paramètres du journal filtré sur cette fiche, ou `null` quand le lien
   * ne doit pas s'offrir : sans `activity:read`, le journal rendrait `403`.
   */
  protected readonly journalParams = computed(() =>
    this.permissions.can('activity:read')
      ? { subjectType: 'product', subjectId: this.productId() }
      : null,
  );

  /** L'ancre de la vue parcourue, rendue par la page 1. */
  private asOf: string | null = null;
  /** Numéro de la dernière lecture lancée : une réponse plus ancienne est jetée. */
  private requestSeq = 0;

  constructor() {
    effect(() => {
      const id = this.productId();
      if (id !== '') {
        void this.open(id);
      }
    });
  }

  /** Relit depuis la page 1, sur une vue neuve — le geste « Réessayer ». */
  protected retry(): void {
    void this.open(this.productId());
  }

  /** La page 1 rouvre une vue neuve ; les autres lisent la vue figée. */
  protected async goTo(page: number): Promise<void> {
    const id = this.productId();
    if (page === 1 || this.asOf === null) {
      await this.open(id);
      return;
    }
    const seq = ++this.requestSeq;
    this.paging.set(true);
    this.pageError.set(false);
    try {
      const view = await this.api.page(id, { page, pageSize: PAGE_SIZE, asOf: this.asOf });
      if (seq === this.requestSeq) {
        this.show(view, false);
      }
    } catch (error) {
      if (seq !== this.requestSeq) {
        return;
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        // L'ancre ne désigne plus rien de cet historique : la vue figée
        // n'existe plus, on en rouvre une neuve.
        await this.open(id);
        return;
      }
      this.pageError.set(true);
    } finally {
      if (seq === this.requestSeq) {
        this.paging.set(false);
      }
    }
  }

  /** La page 1, sans ancre : la réponse fixe la vue que les suivantes liront. */
  private async open(id: string): Promise<void> {
    const seq = ++this.requestSeq;
    this.asOf = null;
    this.state.set('loading');
    this.paging.set(false);
    this.pageError.set(false);
    try {
      const view = await this.api.page(id, { page: 1, pageSize: PAGE_SIZE });
      if (seq !== this.requestSeq) {
        return;
      }
      this.show(view, true);
      this.state.set('ready');
    } catch {
      if (seq === this.requestSeq) {
        this.state.set('error');
      }
    }
  }

  private show(view: ProductHistoryPageView, fresh: boolean): void {
    this.lines.set(view.entries.map(toLine));
    this.page.set(view.page);
    this.total.set(view.total);
    this.asOf = view.asOf;
    if (fresh) {
      this.frozenAt.set(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      );
    }
  }
}
