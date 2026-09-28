import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID } from '@angular/core';

import { REFRESH_INTERVAL_MS } from '../periodic-refresh';
import { type DayJournal, DayVersionService } from './day-version.service';

/**
 * Le filet (D5) : une relecture complète toutes les cinq minutes, quoi qu'il
 * arrive, contre ce qu'aucun journal ne voit — l'heure qui tourne, une donnée
 * du référentiel, un écrivain oublié.
 */
export const SAFETY_NET_MS = 5 * 60_000;

/** Ce qu'un écran confie au veilleur. */
export interface DayWatch {
  /** Les journaux dont l'écran dépend — chacun par la porte que son droit ouvre. */
  readonly journals: readonly DayJournal[];
  /** La journée affichée ; `null` tant qu'elle n'est pas connue. Relue à chaque tick. */
  readonly date: () => string | null;
  /** La relecture complète. Porte ses propres échecs : elle ne rejette pas. */
  readonly reload: () => Promise<void>;
  /**
   * Le jour de service à l'horloge du poste, pour un écran dont le SERVEUR
   * choisit la journée (fiche d'atelier, colisage). Quand il tourne, la
   * version de l'ancienne date ne bougera plus jamais : le veilleur relit sans
   * attendre le filet, et sans rien demander à la base.
   */
  readonly clockDay?: () => string;
}

interface Watcher {
  readonly spec: DayWatch;
  /** Dernière version vue, par `journal|date`. */
  readonly seen: Map<string, number>;
  reloading: boolean;
  /** Le jour d'horloge à la dernière relecture ; `null` sans `clockDay`. */
  clockDay: string | null;
}

function keyOf(journal: DayJournal, date: string): string {
  return `${journal}|${date}`;
}

/**
 * **Le veilleur de journée** (`plan-version-par-journee.md`, D4) : toutes les
 * 15 s, onglet visible, il demande « la version a-t-elle changé ? » au lieu de
 * tout relire, et ne relit l'écran que si oui.
 *
 * - 🔴 **Égalité, jamais ordre.** Le balayage à sept jours fait REDESCENDRE la
 *   version d'une journée ancienne (contrat `dayVersionViewSchema`) : une
 *   version différente est un changement, qu'elle monte ou qu'elle descende.
 * - **Une question par onglet et par journée** : un écran de plus sur la même
 *   journée n'ajoute aucune lecture de version.
 * - **Une lecture en échec ne relit rien** et garde la version d'avant : le
 *   tick suivant reposera la question. Le filet borne le retard.
 * - La première version lue d'une journée est une **référence**, pas un
 *   changement : l'écran vient de lire. Changer de journée repart de zéro.
 */
@Injectable({ providedIn: 'root' })
export class DayVersionWatcher {
  private readonly versions = inject(DayVersionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly watchers = new Set<Watcher>();
  private timer: number | null = null;
  private ticking = false;
  private readonly onVisibility = (): void => void this.tick();

  /**
   * Branche un écran. ⚠️ Dans un contexte d'injection (le constructeur) :
   * l'arrêt suit le `DestroyRef` de l'écran.
   */
  watch(spec: DayWatch): void {
    if (!this.browser) {
      return;
    }
    const watcher: Watcher = {
      spec,
      seen: new Map(),
      reloading: false,
      clockDay: spec.clockDay?.() ?? null,
    };
    this.watchers.add(watcher);
    this.start();
    const net = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.reload(watcher);
      }
    }, SAFETY_NET_MS);
    inject(DestroyRef).onDestroy(() => {
      window.clearInterval(net);
      this.watchers.delete(watcher);
      if (this.watchers.size === 0) {
        this.stop();
      }
    });
  }

  private start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = window.setInterval(() => void this.tick(), REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Une question par `journal|date` de tout l'onglet, puis chaque écran compare. */
  private async tick(): Promise<void> {
    if (this.ticking || document.visibilityState !== 'visible') {
      return;
    }
    this.ticking = true;
    try {
      this.followClock();
      const asked = new Map<string, Promise<number | null>>();
      for (const watcher of this.watchers) {
        const date = watcher.spec.date();
        if (date === null) {
          continue;
        }
        for (const journal of watcher.spec.journals) {
          const key = keyOf(journal, date);
          if (!asked.has(key)) {
            asked.set(key, this.read(journal, date));
          }
        }
      }
      const answers = new Map<string, number | null>();
      await Promise.all([...asked].map(async ([key, answer]) => answers.set(key, await answer)));
      for (const watcher of this.watchers) {
        this.compare(watcher, answers);
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Minuit est passé au poste : l'écran relit, sans question à la base. */
  private followClock(): void {
    for (const watcher of this.watchers) {
      const today = watcher.spec.clockDay?.() ?? null;
      if (today !== null && today !== watcher.clockDay && !watcher.reloading) {
        watcher.clockDay = today;
        this.reload(watcher);
      }
    }
  }

  private async read(journal: DayJournal, date: string): Promise<number | null> {
    try {
      return await this.versions.version(journal, date);
    } catch {
      return null;
    }
  }

  private compare(watcher: Watcher, answers: ReadonlyMap<string, number | null>): void {
    // En pleine relecture, on ne note rien : le changement sera revu au tick suivant.
    if (watcher.reloading) {
      return;
    }
    const date = watcher.spec.date();
    const keys = date === null ? [] : watcher.spec.journals.map((journal) => keyOf(journal, date));
    for (const key of watcher.seen.keys()) {
      if (!keys.includes(key)) {
        watcher.seen.delete(key);
      }
    }
    let changed = false;
    for (const key of keys) {
      const version = answers.get(key) ?? null;
      if (version === null) {
        continue;
      }
      const previous = watcher.seen.get(key);
      changed ||= previous !== undefined && previous !== version;
      watcher.seen.set(key, version);
    }
    if (changed) {
      this.reload(watcher);
    }
  }

  private reload(watcher: Watcher): void {
    if (watcher.reloading) {
      return;
    }
    watcher.reloading = true;
    void watcher.spec.reload().finally(() => {
      watcher.reloading = false;
    });
  }
}
