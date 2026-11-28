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

import { DossierPrintService } from '../../dossier-print.service';
import {
  authorLabel,
  causeLabel,
  dispatchNeedsAttention,
  dispatchStandingLabel,
  dispatchStandingOf,
  paperLabel,
  paperStateOf,
  parisMoment,
  versionTitle,
} from '../../plan-versions/plan-version-wording';
import { PlanVersionsService } from '../../plan-versions/plan-versions.service';
import { PlanVersionDiff } from '../plan-version-diff/plan-version-diff';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de la liste, déjà dite. */
interface VersionRow {
  readonly version: number;
  readonly title: string;
  readonly cause: string;
  readonly moment: string;
  readonly author: string;
  /** Le papier s'ouvre d'un lien : seul celui de la version courante est servi. */
  readonly canOpenPaper: boolean;
  readonly paper: string;
}

/** Un destinataire du dossier, déjà dit. */
interface DispatchRow {
  readonly recipientId: string;
  readonly name: string;
  readonly standing: string;
  readonly needsAttention: boolean;
  readonly lastFailed: boolean;
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
 * Le papier d'une version ancienne ne s'ouvre pas d'ici : la route du dossier
 * sert le papier de la version COURANTE seulement. La liste dit donc s'il est
 * rangé, et n'offre le lien que sur la dernière.
 */
@Component({
  selector: 'app-plan-versions-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    PlanVersionDiff,
  ],
  templateUrl: './plan-versions-section.html',
  styleUrl: './plan-versions-section.scss',
})
export class PlanVersionsSection {
  private readonly planVersions = inject(PlanVersionsService);
  private readonly dossier = inject(DossierPrintService);

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly versions = signal<readonly PlanVersionView[]>([]);
  /** `null` : pas lus (échec dit à part, la liste reste). */
  private readonly dispatchList = signal<readonly DossierDispatchView[] | null>(null);
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
    const latest = this.latest();
    return this.versions()
      .map((entry) => {
        const paper = paperStateOf(entry);
        return {
          version: entry.version,
          title: versionTitle(entry),
          cause: causeLabel(entry.cause),
          moment: parisMoment(entry.recordedAt),
          author: authorLabel(entry.author),
          canOpenPaper: entry.version === latest && paper.kind === 'stored',
          paper: paperLabel(paper),
        };
      })
      .reverse();
  });

  protected readonly dispatches = computed<readonly DispatchRow[] | null>(() => {
    const list = this.dispatchList();
    if (list === null) {
      return null;
    }
    return list.map((dispatch) => {
      const standing = dispatchStandingOf(dispatch, this.latest());
      return {
        recipientId: dispatch.recipientId,
        name: dispatch.name,
        standing: dispatchStandingLabel(standing),
        needsAttention: dispatchNeedsAttention(standing),
        lastFailed: dispatch.lastAttempt?.outcome === 'failed',
      };
    });
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

  /** Le papier de la version courante : le dossier archivé, ouvert dans un onglet. */
  protected async openPaper(): Promise<void> {
    this.paperFailed.set(false);
    try {
      const pdf = await this.dossier.frozenPdf(this.date());
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
