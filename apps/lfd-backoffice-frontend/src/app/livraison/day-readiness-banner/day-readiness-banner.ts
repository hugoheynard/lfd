import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryCompositionGap, DeliveryDayArrestView, DeliveryDayDue } from '@lfd/contracts';
import { Router } from '@angular/router';
import { FoldButtonComponent, FoldCalloutComponent, FoldLinkComponent } from 'fold-ng';

import { DeliveryRoundsService } from '../delivery-rounds.service';

type ReadinessState =
  | { readonly status: 'idle' }
  | { readonly status: 'ready'; readonly arrest: DeliveryDayArrestView | null }
  | { readonly status: 'error' };

/** Ce qui manque au socle, et où le régler — les mots du refus de « Proposer ». */
const GAP_WORDS: Readonly<Record<DeliveryCompositionGap, string>> = {
  no_measured_vehicle:
    'aucun véhicule en service n’a ses cotes. Renseignez-les dans Réglages › Livraison › Véhicules',
  no_active_bin_type:
    'aucun type de bac n’est en service. Ajoutez-en un dans Réglages › Livraison › Bacs',
};

/** Le jour imminent, comme l'équipe le dit. */
const DUE_WORDS: Readonly<Record<DeliveryDayDue, string>> = {
  today: 'Aujourd’hui',
  tomorrow: 'Demain',
};

/** Là où se règle le calcul — le même lien que le panneau « Plus d'options ». */
const SETTINGS_LINK = '/reglages/livraison/depart';

function deliveries(count: number): string {
  return count > 1 ? `${count} livraisons` : `${count} livraison`;
}

/**
 * **Le plan arrêté, sur l'écran des tournées** (plan de composition
 * automatique, §16.5, S5, CA6a).
 *
 * Refondu le 2026-10-26 (Hugo : « incompréhensible ») : des livraisons hors
 * tournée — « 3 livraisons ne sont dans aucune tournée. », le plan arrêté en
 * discret, et deux gestes, « Les placer automatiquement » (la page propose en
 * `insert`, sans panneau) et « Les placer à la main » (la page met « À
 * répartir » en avant) ; le refus du calcul s'y lit, avec le lien vers le
 * réglage. Tout placé : « Plan arrêté — N livraisons, toutes en tournée ».
 * Arrêté sans socle de composition (CA-D3) et lecture en échec : inchangés.
 * Le jour J ou la veille (`due`), l'encadré passe en avertissement. Un jour
 * passé : un constat, sans geste.
 *
 * Il relit à chaque changement de `refresh` : la page lui passe sa
 * composition, pour que « hors tournée » suive les gestes du tableau.
 */
@Component({
  selector: 'app-day-readiness-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLinkComponent],
  templateUrl: './day-readiness-banner.html',
  styleUrl: './day-readiness-banner.scss',
})
export class DayReadinessBanner {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly router = inject(Router);

  readonly day = input.required<string>();
  /** Change de valeur : relire. */
  readonly refresh = input<unknown>(null);
  readonly canWrite = input(false);

  /** Le jour est passé : un constat, sans invitation ni geste (Hugo, 2026-10-26). */
  readonly past = input(false);
  /** Le calcul est en vol : « Les placer automatiquement » tourne. */
  readonly placing = input(false);
  /** Le refus du calcul, tel que le serveur l'a dit. */
  readonly refusal = input<string | null>(null);

  /** « Les placer automatiquement » : la page propose en `insert`, sans panneau. */
  readonly autoPlace = output();
  /** « Les placer à la main » : la page met « À répartir » en avant. */
  readonly placeByHand = output();

  protected readonly state = signal<ReadinessState>({ status: 'idle' });
  private request = 0;

  protected readonly arrest = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.arrest : null;
  });
  protected readonly countLabel = computed(() => deliveries(this.arrest()?.deliveryCount ?? 0));
  /** « 22 livraisons, toutes parties en tournée » / « …, dont 2 jamais placées en tournée ». */
  protected readonly pastWords = computed(() => {
    const unplaced = this.arrest()?.unplacedCount ?? 0;
    if (unplaced === 0) {
      return `${this.countLabel()}, toutes parties en tournée`;
    }
    const placed = unplaced > 1 ? 'jamais placées' : 'jamais placée';
    return `${this.countLabel()}, dont ${String(unplaced)} ${placed} en tournée`;
  });
  /** Le jour est aujourd'hui ou demain : l'encadré passe en avertissement. */
  protected readonly imminent = computed(() => this.arrest()?.due != null);
  /** « 3 livraisons ne sont dans aucune tournée. » */
  protected readonly unplacedWords = computed(() => {
    const count = this.arrest()?.unplacedCount ?? 0;
    return count > 1
      ? `${String(count)} livraisons ne sont dans aucune tournée.`
      : `${String(count)} livraison n’est dans aucune tournée.`;
  });
  /** « Demain · plan arrêté — 12 livraisons », en plus discret. */
  protected readonly asideWords = computed(() => {
    const due = this.arrest()?.due ?? null;
    const plan = `plan arrêté — ${this.countLabel()}`;
    return due === null ? `Plan arrêté — ${this.countLabel()}` : `${DUE_WORDS[due]} · ${plan}`;
  });
  protected readonly gapWords = computed(() => {
    const gap = this.arrest()?.compositionGap ?? null;
    return gap === null ? null : GAP_WORDS[gap];
  });

  constructor() {
    effect(() => {
      const day = this.day();
      this.refresh();
      untracked(() => void this.load(day));
    });
  }

  protected openSettings(): void {
    void this.router.navigateByUrl(SETTINGS_LINK);
  }

  private async load(day: string): Promise<void> {
    const request = ++this.request;
    try {
      const view = await this.rounds.readiness(day);
      if (request === this.request) {
        this.state.set({ status: 'ready', arrest: view.arrested });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }
}
