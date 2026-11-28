import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { DossierDispatchView, PlanVersionDiffView, PlanVersionView } from '@lfd/contracts';
import {
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
  authorLabel,
  causeLabel,
  paperLabel,
  paperStateOf,
  parisMoment,
  versionTitle,
} from '../../plan-versions/plan-version-wording';
import {
  type PlanVersionPaperKind,
  PlanVersionsService,
} from '../../plan-versions/plan-versions.service';
import { PlanVersionDiff } from '../plan-version-diff/plan-version-diff';
import { PlanVersionDispatches } from '../plan-version-dispatches/plan-version-dispatches';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de la liste, déjà dite. */
interface VersionRow {
  readonly version: number;
  readonly title: string;
  readonly cause: string;
  readonly moment: string;
  readonly author: string;
  /**
   * La version dont le papier rangé s'ouvre — elle-même, ou pour un retrait
   * celle qui en tient lieu ; `null` : pas de lien pour ce papier.
   */
  readonly dossierVersion: number | null;
  readonly countVersion: number | null;
  readonly paper: string;
}

/** La version dont un papier rangé s'ouvre, `null` s'il n'est pas rangé (ou inconnu). */
export function openablePaper(
  paper: PlanVersionView['paper'],
  kind: PlanVersionPaperKind,
): number | null {
  const stored = kind === 'dossier' ? paper.dossier : paper.count;
  return paper.version !== null && stored === true ? paper.version : null;
}

/** La comparaison par défaut : la courante contre la précédente. */
export function defaultRange(
  versions: readonly Pick<PlanVersionView, 'version'>[],
): { readonly from: number; readonly to: number } | null {
  const last = versions.at(-1);
  if (last === undefined) {
    return null;
  }
  const previous = versions.at(-2);
  return { from: previous?.version ?? last.version, to: last.version };
}

/**
 * **Les versions du plan d'une journée**, dans le Prod manager
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H5) : la liste
 * (cause, qui, quand, papier rangé ou non), la comparaison de deux versions —
 * par défaut la courante contre la précédente — et ce que chaque destinataire
 * du dossier a reçu.
 *
 * Chaque version dont le papier est rangé l'ouvre d'un lien (dossier et
 * compte à produire) ; un retrait ouvre celui de la version qui en tient lieu.
 * Les destinataires et le renvoi de la courante (H6) vivent dans
 * `app-plan-version-dispatches`.
 */
@Component({
  selector: 'app-plan-versions-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    PlanVersionDiff,
    PlanVersionDispatches,
  ],
  templateUrl: './plan-versions-section.html',
  styleUrl: './plan-versions-section.scss',
})
export class PlanVersionsSection {
  private readonly planVersions = inject(PlanVersionsService);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly versions = signal<readonly PlanVersionView[]>([]);
  /** `null` : pas lus (échec dit à part, la liste reste). */
  protected readonly dispatchList = signal<readonly DossierDispatchView[] | null>(null);
  protected readonly dispatchesFailed = signal(false);

  protected readonly from = signal<number | null>(null);
  protected readonly to = signal<number | null>(null);
  protected readonly diffState = signal<LoadState>('loading');
  protected readonly diff = signal<PlanVersionDiffView | null>(null);
  protected readonly paperFailed = signal(false);

  /** Le jeton de la dernière lecture : une réponse d'une journée quittée est jetée. */
  private listToken = 0;
  private diffToken = 0;
  private openedUrl: string | null = null;

  protected readonly latest = computed(() => this.versions().at(-1)?.version ?? null);

  protected readonly options = computed(() =>
    this.versions().map((entry) => ({
      value: entry.version,
      label: `Version ${entry.version} · ${causeLabel(entry.cause)}`,
    })),
  );

  protected readonly rows = computed<readonly VersionRow[]>(() => {
    return this.versions()
      .map((entry) => {
        const paper = paperStateOf(entry);
        return {
          version: entry.version,
          title: versionTitle(entry),
          cause: causeLabel(entry.cause),
          moment: parisMoment(entry.recordedAt),
          author: authorLabel(entry.author),
          dossierVersion: openablePaper(entry.paper, 'dossier'),
          countVersion: openablePaper(entry.paper, 'count'),
          paper: paperLabel(paper),
        };
      })
      .reverse();
  });

  constructor() {
    effect(() => {
      const date = this.date();
      untracked(() => void this.load(date));
    });
    effect(() => {
      const from = this.from();
      const to = this.to();
      if (from !== null && to !== null) {
        untracked(() => void this.compare(this.date(), from, to));
      }
    });
    inject(DestroyRef).onDestroy(() => this.revokeOpened());
  }

  protected async load(date: string = this.date()): Promise<void> {
    const token = ++this.listToken;
    this.state.set('loading');
    this.from.set(null);
    this.to.set(null);
    this.diff.set(null);
    const [versions, dispatches] = await Promise.allSettled([
      this.planVersions.list(date),
      this.planVersions.dispatches(date),
    ]);
    if (token !== this.listToken) {
      return;
    }
    this.dispatchList.set(dispatches.status === 'fulfilled' ? dispatches.value : null);
    this.dispatchesFailed.set(dispatches.status === 'rejected');
    if (versions.status === 'rejected') {
      this.state.set('error');
      return;
    }
    this.versions.set(versions.value);
    this.state.set('ready');
    const range = defaultRange(versions.value);
    this.from.set(range?.from ?? null);
    this.to.set(range?.to ?? null);
  }

  /** Les deux bornes se lisent dans l'ordre, quel que soit le choix : le serveur refuse l'inverse. */
  protected async compare(date: string, a: number, b: number): Promise<void> {
    const token = ++this.diffToken;
    this.diffState.set('loading');
    try {
      const diff = await this.planVersions.compare(date, Math.min(a, b), Math.max(a, b));
      if (token === this.diffToken) {
        this.diff.set(diff);
        this.diffState.set('ready');
      }
    } catch {
      if (token === this.diffToken) {
        this.diffState.set('error');
      }
    }
  }

  protected retryCompare(): void {
    const from = this.from();
    const to = this.to();
    if (from !== null && to !== null) {
      void this.compare(this.date(), from, to);
    }
  }

  /** Après un renvoi : relit les envois seulement, les versions n'ont pas bougé. */
  protected async reloadDispatches(): Promise<void> {
    const token = this.listToken;
    try {
      const dispatches = await this.planVersions.dispatches(this.date());
      if (token === this.listToken) {
        this.dispatchList.set(dispatches);
        this.dispatchesFailed.set(false);
      }
    } catch {
      if (token === this.listToken) {
        this.dispatchesFailed.set(true);
      }
    }
  }

  /** Le papier rangé d'une version, ouvert dans un onglet. */
  protected async openPaper(version: number, kind: PlanVersionPaperKind): Promise<void> {
    this.paperFailed.set(false);
    try {
      const pdf = await this.planVersions.paper(this.date(), version, kind);
      this.revokeOpened();
      this.openedUrl = URL.createObjectURL(pdf);
      window.open(this.openedUrl, '_blank');
    } catch {
      this.paperFailed.set(true);
    }
  }

  private revokeOpened(): void {
    if (this.openedUrl !== null) {
      URL.revokeObjectURL(this.openedUrl);
      this.openedUrl = null;
    }
  }
}
