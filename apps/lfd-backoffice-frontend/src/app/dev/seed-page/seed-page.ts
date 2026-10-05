import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DevScenarioResetReport, DevSeedReport } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldMeterComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSpinnerComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { databaseSize, longDay, purgeLines } from '../dev-scenario-format';
import {
  DEV_SCENARIO_STEPS,
  type DevScenarioStepText,
  LAST_SCENARIO_STEP,
} from '../dev-scenario-steps';
import { DevScenarioService } from '../dev-scenario.service';
import { DevSeedService } from '../dev-seed.service';

/** Où en est une étape, à l'écran. */
type StepStatus = 'done' | 'next' | 'upcoming' | 'running';

/** Une ligne de la liste des étapes. */
interface StepRow {
  readonly text: DevScenarioStepText;
  readonly status: StepStatus;
  /** Le résumé compté par le serveur, quand l'étape est faite. */
  readonly summary: string | null;
  /** Le refus du serveur, tel quel, quand cette étape vient d'échouer. */
  readonly failure: string | null;
}

const STEP_BADGES: Readonly<
  Record<StepStatus, { label: string; variant: 'success' | 'accent' | 'neutral' | 'info' }>
> = {
  done: { label: 'Fait', variant: 'success' },
  next: { label: 'Prochaine', variant: 'accent' },
  upcoming: { label: 'À venir', variant: 'neutral' },
  running: { label: 'En cours…', variant: 'info' },
};

/**
 * **Recharger le jeu de données de développement**, sans quitter le navigateur.
 *
 * Les scripts en ligne de commande font déjà ce travail. Cet écran existe pour
 * le moment où on n'a pas de terminal sous la main : on montre l'application, la
 * journée a tourné, et la « commande de demain » est devenue celle d'hier. Il
 * faut la recaler là, tout de suite.
 *
 * ## Ce qu'il fait, et il le DIT avant
 *
 * ⚠️ Le geste est destructif : il supprime toute société qui n'est pas le client
 * de référence, et repose ses commandes. La page l'annonce en toutes lettres
 * plutôt que derrière un « êtes-vous sûr ? » — une confirmation qui ne dit pas
 * ce qu'elle détruit ne fait que ralentir le même clic.
 *
 * Ce qu'elle ne détruit pas mérite d'être dit aussi : le catalogue, le
 * référentiel, l'annuaire de l'équipe et les règles de prix ne bougent pas.
 *
 * ## La journée de démo, étape par étape (2026-10-05)
 *
 * Le scénario de commandes ne se rejoue plus d'un bloc : six étapes, cochées
 * d'après ce que la base porte, et une seule action principale qui nomme la
 * suivante (`documentation/order/plan-jeu-de-donnees-par-etapes.md` §3).
 * « Charger jusqu'ici » enchaîne les étapes UNE PAR UNE : l'écran dit toujours
 * laquelle il joue, et un échec s'arrête sur l'étape qui a refusé.
 *
 * ## Cet écran n'existe pas en production
 *
 * Il n'est pas caché derrière un drapeau : il est **absent du bundle**. Rien ne
 * l'importe depuis un build de production — cf. `dev-tools.ts`.
 */
@Component({
  selector: 'app-dev-seed-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldMeterComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSpinnerComponent,
    RouterLink,
  ],
  templateUrl: './seed-page.html',
  styleUrl: './seed-page.scss',
})
export class DevSeedPage {
  private readonly seeding = inject(DevSeedService);
  private readonly scenario = inject(DevScenarioService);
  private readonly notify = inject(NotifyService);

  protected readonly last = LAST_SCENARIO_STEP;
  protected readonly badges = STEP_BADGES;

  /** « Tout recharger » en cours. */
  protected readonly reloading = signal(false);
  /** L'étape en train de se jouer — 0 pendant la remise à l'état de base. */
  protected readonly playing = signal<number | null>(null);
  /** La dernière étape refusée, et le message du serveur tel quel. */
  private readonly failure = signal<{ readonly step: number; readonly message: string } | null>(
    null,
  );
  /** La confirmation de la remise à l'état de base est ouverte. */
  protected readonly confirmingReset = signal(false);
  protected readonly resetReport = signal<DevScenarioResetReport | null>(null);
  protected readonly resetError = signal<string | null>(null);
  protected readonly report = signal<DevSeedReport | null>(null);

  protected readonly view = this.scenario.view;
  protected readonly loadError = this.scenario.loadError;

  /** Un seul geste à la fois : TOUS les boutons sont coupés pendant qu'un geste tourne. */
  protected readonly busy = computed(() => this.reloading() || this.playing() !== null);

  /** L'étape atteinte, lue en base — `null` si la journée n'est pas posée. */
  protected readonly reached = computed<number | null>(() => this.view()?.reached ?? null);

  protected readonly day = computed(() => {
    const view = this.view();
    return view === null ? null : longDay(view.day);
  });

  protected readonly size = computed(() => {
    const view = this.view();
    return view === null ? null : databaseSize(view.databaseBytes);
  });

  /** Ce que veut dire l'étape atteinte, en fin de phrase d'état. */
  protected readonly meaning = computed(() => {
    const reached = this.reached();
    return reached === null ? null : (DEV_SCENARIO_STEPS[reached]?.meaning ?? null);
  });

  protected readonly rows = computed<readonly StepRow[]>(() => {
    const view = this.view();
    const reached = this.reached();
    const playing = this.playing();
    const failure = this.failure();
    return DEV_SCENARIO_STEPS.map((text) => {
      const status = stepStatus(text.step, reached, playing);
      const served = view?.steps.find((candidate) => candidate.step === text.step);
      return {
        text,
        status,
        summary: status === 'done' ? (served?.summary ?? null) : null,
        failure:
          failure !== null && failure.step === text.step && status !== 'done'
            ? failure.message
            : null,
      };
    });
  });

  /** L'étape que l'action principale joue, ou `null` à la dernière / sans journée. */
  protected readonly nextStep = computed(() => {
    const reached = this.reached();
    if (reached === null || reached >= LAST_SCENARIO_STEP) {
      return null;
    }
    return DEV_SCENARIO_STEPS[reached + 1] ?? null;
  });

  protected readonly nextLabel = computed(() => {
    const next = this.nextStep();
    if (next === null) {
      return null;
    }
    const retry = this.failure()?.step === next.step;
    return `${retry ? 'Réessayer' : 'Étape suivante'} : ${next.title}`;
  });

  /** Ce que la bannière annonce pendant un geste. */
  protected readonly playingText = computed(() => {
    const playing = this.playing();
    return playing === null ? null : (DEV_SCENARIO_STEPS[playing] ?? null);
  });

  protected readonly purge = computed(() => {
    const report = this.resetReport();
    return report === null ? [] : purgeLines(report);
  });

  constructor() {
    // Le chargement du démarrage est le SEUL qui absorbe son échec : il est
    // retenu dans `loadError`, et l'écran le montre avec de quoi réessayer.
    void this.retryLoad();
  }

  protected async retryLoad(): Promise<void> {
    try {
      await this.scenario.refresh();
    } catch {
      // Retenu dans `loadError`.
    }
  }

  protected playNext(): Promise<void> {
    const next = this.nextStep();
    return next === null ? Promise.resolve() : this.loadUntil(next.step);
  }

  /**
   * Joue les étapes une par une jusqu'à `target`, en relisant la base après
   * chacune. S'arrête sur la première qui refuse — ou qui ne fait pas avancer
   * la base, ce qui bouclerait sinon sans fin.
   */
  protected async loadUntil(target: number): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.failure.set(null);
    try {
      for (let reached = this.reached(); reached !== null && reached < target;) {
        const step = reached + 1;
        const text = DEV_SCENARIO_STEPS[step];
        this.playing.set(step);
        try {
          await this.scenario.next();
        } catch (error: unknown) {
          this.failure.set({
            step,
            message: httpErrorMessage(error, 'Le serveur n’a pas donné de raison.'),
          });
          return;
        }
        if (text !== undefined) {
          this.notify.success(text.title);
        }
        const after = this.reached();
        if (after === null || after < step) {
          return;
        }
        reached = after;
      }
    } finally {
      this.playing.set(null);
    }
  }

  protected async resetScenario(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.failure.set(null);
    this.resetError.set(null);
    this.resetReport.set(null);
    this.playing.set(0);
    try {
      this.resetReport.set(await this.scenario.reset());
      this.notify.success('Journée de démo remise à l’état de base.');
    } catch (error: unknown) {
      this.resetError.set(httpErrorMessage(error, 'Le serveur n’a pas donné de raison.'));
    } finally {
      this.playing.set(null);
      this.confirmingReset.set(false);
    }
  }

  /** Le nom du livreur affecté — le requérant —, ou `null` s'il n'y en a pas. */
  protected readonly driverName = computed(() => {
    const driver = this.report()?.delivery.driver;
    return driver?.status === 'assigned' ? driver.name : null;
  });

  /** Le refus du serveur, mot pour mot : il nomme le droit manquant et où l'ouvrir. */
  protected readonly driverRefusal = computed(() => {
    const driver = this.report()?.delivery.driver;
    return driver?.status === 'refused' ? driver.reason : null;
  });

  /**
   * Ce que la coupe a emporté, en une phrase.
   *
   * `null` quand rien n'a été supprimé : « 0 société supprimée » se lit comme un
   * échec, alors que c'est le cas NORMAL d'une base déjà propre.
   */
  protected readonly removed = computed(() => {
    const reset = this.report()?.reset;
    if (reset === undefined) {
      return null;
    }
    const parts = [
      count(reset.companies, 'société', 'sociétés'),
      count(reset.people, 'personne', 'personnes'),
      count(reset.pickupPoints, 'point de retrait', 'points de retrait'),
      count(reset.zones, 'zone', 'zones'),
      // Comptées et dites : une décision tarifaire d'essai n'est pas un décor,
      // c'est un prix.
      count(reset.priceRules, 'règle de prix', 'règles de prix'),
      count(reset.volumeLadders, 'barème de volume', 'barèmes de volume'),
    ].filter((part) => part !== null);
    return parts.length === 0 ? null : parts.join(', ');
  });

  protected async reload(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.reloading.set(true);
    try {
      this.report.set(await this.seeding.reload());
      this.resetReport.set(null);
      this.notify.success('Jeu de données rechargé.');
    } catch (error: unknown) {
      // Le message du serveur, pas le nôtre : c'est lui qui sait si la base
      // n'est pas locale, si le catalogue manque, ou si la porte d'activation
      // a refusé.
      this.notify.error(error, 'Le rechargement a échoué.');
    } finally {
      this.reloading.set(false);
      // La journée de démo a été reposée : l'écran relit où elle en est.
      await this.retryLoad();
    }
  }
}

function stepStatus(step: number, reached: number | null, playing: number | null): StepStatus {
  if (playing === step) {
    return 'running';
  }
  if (reached !== null && step <= reached) {
    return 'done';
  }
  return reached !== null && step === reached + 1 ? 'next' : 'upcoming';
}

/** « 3 sociétés », ou `null` quand il n'y en a pas — zéro ne se dit pas. */
function count(value: number, singular: string, plural: string): string | null {
  if (value === 0) {
    return null;
  }
  return `${value} ${value === 1 ? singular : plural}`;
}
