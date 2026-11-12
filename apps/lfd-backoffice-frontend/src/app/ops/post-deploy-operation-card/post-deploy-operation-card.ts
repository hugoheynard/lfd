import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  PostDeployOperationView,
  PostDeployReportView,
  PostDeployRunState,
  PostDeployRunView,
} from '@lfd/ops-contract';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { GestureIntents } from '../../shared/gesture-intents';
import { PostDeployService } from '../post-deploy.service';

/** L'avancement d'une application se relit à ce rythme, jusqu'à un état final. */
export const RUN_POLL_MS = 2000;
/** La fenêtre d'application se réévalue à ce rythme : « Appliquer » s'éteint de lui-même. */
const CLOCK_TICK_MS = 15_000;

/** Le sujet du geste « Simuler » : une clé tant que la simulation n'a pas abouti. */
const SIMULATE_INTENT = 'simulate';

const RUN_STATE_LABEL: Record<PostDeployRunState, string> = {
  simulated: 'simulée',
  running: 'en cours',
  succeeded: 'réussie',
  failed: 'échouée',
  interrupted: 'interrompue',
};

const FINAL_STATES: ReadonlySet<PostDeployRunState> = new Set([
  'succeeded',
  'failed',
  'interrupted',
]);

/**
 * **Une opération après déploiement** : ce qu'elle fait, ce qu'elle trouverait,
 * ce qu'elle ne sait pas défaire — puis « Simuler », et « Appliquer » sur
 * cette simulation-là (plan `plan-operations-apres-deploiement.md`, § 7).
 *
 * « Appliquer » n'existe qu'après une simulation faite ICI, par la personne
 * qui regarde, tant que sa fenêtre (`applicableUntil`) est ouverte, et
 * derrière « j'ai lu ». Le serveur le refuse de toute façon sinon ; l'écran
 * n'offre pas un geste qu'il refuserait.
 */
@Component({
  selector: 'app-post-deploy-operation-card',
  imports: [
    DatePipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './post-deploy-operation-card.html',
  styleUrl: './post-deploy-operation-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostDeployOperationCard {
  private readonly service = inject(PostDeployService);
  private readonly intents = new GestureIntents();

  readonly operation = input.required<PostDeployOperationView>();
  /** Le titre de chaque opération par clé, pour dire « bloquée par … » en clair. */
  readonly titles = input<Readonly<Record<string, string>>>({});
  readonly canSimulate = input(false);
  readonly canApply = input(false);
  /** Une application vient d'atteindre un état final : l'état de toutes est à relire. */
  readonly finished = output<void>();

  /** Le passage suivi par cette carte : la simulation de soi, puis son application. */
  protected readonly run = signal<PostDeployRunView | null>(null);
  protected readonly acknowledged = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly now = signal(Date.now());

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  protected readonly runStateLabel = (state: PostDeployRunState): string => RUN_STATE_LABEL[state];

  protected readonly blockedByTitles = computed(() =>
    this.operation().blockedBy.map((key) => this.titles()[key] ?? key),
  );

  /** Le rapport montré : celui de ma simulation, sinon celui de la lecture de la page. */
  protected readonly report = computed<PostDeployReportView | null>(() => {
    const run = this.run();
    if (run !== null && run.state !== 'simulated' && run.progress !== null) return run.progress;
    return run?.simulation ?? this.operation().current;
  });

  protected readonly running = computed(() => this.run()?.state === 'running');

  protected readonly finalRun = computed(() => {
    const run = this.run();
    return run !== null && FINAL_STATES.has(run.state) ? run : null;
  });

  /** Ma simulation, encore applicable à l'instant. */
  protected readonly applicable = computed(() => {
    const run = this.run();
    return (
      run !== null &&
      run.state === 'simulated' &&
      Date.parse(run.applicableUntil) > this.now() &&
      run.simulation.writable > 0
    );
  });

  protected readonly showApply = computed(
    () => this.canApply() && this.applicable() && this.operation().blockedBy.length === 0,
  );

  /** Ma simulation, encore valide : son résultat s'annonce, même vide. */
  protected readonly freshSimulation = computed(() => {
    const run = this.run();
    return run !== null && run.state === 'simulated' && Date.parse(run.applicableUntil) > this.now()
      ? run
      : null;
  });

  /** Ma simulation a expiré : la dire, plutôt que faire disparaître le bouton sans un mot. */
  protected readonly expired = computed(() => {
    const run = this.run();
    return (
      run !== null && run.state === 'simulated' && Date.parse(run.applicableUntil) <= this.now()
    );
  });

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(clock);
      if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    });
    // Une application déjà en cours (lancée ailleurs, ou avant de recharger la
    // page) se suit comme la sienne.
    effect(() => {
      const last = this.operation().lastRun;
      untracked(() => {
        if (last?.state === 'running' && this.run() === null) {
          this.run.set(last);
          this.schedulePoll(last.id);
        }
      });
    });
  }

  protected async simulate(): Promise<void> {
    if (this.busy() || this.running()) return;
    this.busy.set(true);
    this.failure.set(null);
    this.acknowledged.set(false);
    try {
      const key = this.operation().key;
      const { runId } = await this.service.simulate(key, this.intents.keyFor(SIMULATE_INTENT));
      this.intents.done(SIMULATE_INTENT);
      this.run.set(await this.service.run(runId));
      this.now.set(Date.now());
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "La simulation n'a pas pu être faite."));
    } finally {
      this.busy.set(false);
    }
  }

  protected async apply(): Promise<void> {
    if (this.busy() || !this.acknowledged() || !this.showApply()) return;
    this.busy.set(true);
    this.failure.set(null);
    try {
      const { runId } = await this.service.apply(this.operation().key);
      this.acknowledged.set(false);
      await this.poll(runId);
    } catch (error) {
      // Le refus du serveur (409) se lit tel quel : il nomme le cas et la sortie.
      this.failure.set(httpErrorMessage(error, "L'application n'a pas pu être lancée."));
    } finally {
      this.busy.set(false);
    }
  }

  private async poll(runId: string): Promise<void> {
    this.pollTimer = null;
    if (this.destroyed) return;
    try {
      const run = await this.service.run(runId);
      this.run.set(run);
      if (FINAL_STATES.has(run.state)) {
        this.finished.emit();
        return;
      }
    } catch {
      // Une lecture ratée n'arrête pas le suivi : l'application tourne côté serveur.
    }
    this.schedulePoll(runId);
  }

  private schedulePoll(runId: string): void {
    if (this.destroyed) return;
    this.pollTimer = setTimeout(() => void this.poll(runId), RUN_POLL_MS);
  }
}
