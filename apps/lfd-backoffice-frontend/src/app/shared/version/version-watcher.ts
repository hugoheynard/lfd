import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { GlobalVersionSubject } from '@lfd/contracts';

import { REFRESH_INTERVAL_MS } from '../periodic-refresh';
import { type VersionSubject, VersionService } from './version.service';

/**
 * Le filet : une relecture complète toutes les cinq minutes, quoi qu'il
 * arrive, contre ce qu'aucun numéro ne voit — l'heure qui tourne, une donnée
 * du référentiel, un écrivain oublié.
 */
export const SAFETY_NET_MS = 5 * 60_000;

/**
 * Les sujets globaux, recopiés en type seul : le contrat est une valeur, et
 * l'importer tirerait zod dans le bundle initial (cf. `PermissionsStore.can`).
 * Le `Record` exhaustif fait échouer la compilation si le contrat en gagne un.
 */
const GLOBAL_SUBJECTS: Readonly<Record<GlobalVersionSubject, true>> = {
  companies: true,
  'orders-all': true,
  'catalog-admin': true,
  pim: true,
};

function isGlobal(subject: VersionSubject): boolean {
  return Object.hasOwn(GLOBAL_SUBJECTS, subject);
}

/** Ce qu'un écran confie au veilleur. */
export interface VersionWatch {
  /**
   * Les sujets dont l'écran dépend, relus à chaque tour : une fonction pour
   * un écran qui ne suit un sujet que si ses droits l'ouvrent. Un sujet que
   * le poste ne peut lire est absent de la réponse, et n'est jamais suivi.
   */
  readonly subjects: readonly VersionSubject[] | (() => readonly VersionSubject[]);
  /**
   * La journée affichée, pour les sujets journaliers ; `null` tant qu'elle
   * n'est pas connue. Relue à chaque tour. Inutile si l'écran ne suit que
   * des sujets globaux.
   */
  readonly date?: () => string | null;
  /** La relecture complète. Porte ses propres échecs : elle ne rejette pas. */
  readonly reload: () => Promise<void>;
  /**
   * Le jour de service à l'horloge du poste, pour un écran dont le SERVEUR
   * choisit la journée (fiche d'atelier, colisage). Quand il tourne, le
   * numéro de l'ancienne date ne bougera plus jamais : le veilleur relit sans
   * attendre le filet, et sans rien demander à la base.
   */
  readonly clockDay?: () => string;
  /**
   * Le numéro que porte la copie de l'écran, pour un sujet global ; `null`
   * tant qu'il n'a rien lu. Fourni, il remplace le dernier numéro vu : l'écran
   * ne se relit que si le numéro servi diffère de celui de SA copie. L'écho
   * de son propre geste, déjà relu avec son numéro, ne relit donc rien, et
   * un écran rouvert sur une copie ancienne se relit au premier tour.
   */
  readonly held?: (subject: GlobalVersionSubject) => number | null;
}

interface Watcher {
  readonly spec: VersionWatch;
  /** Dernier numéro vu, par clé de sujet (`sujet|date` ou `sujet`). */
  readonly seen: Map<string, number>;
  reloading: boolean;
  /** Le jour d'horloge à la dernière relecture ; `null` sans `clockDay`. */
  clockDay: string | null;
}

/** Une question à la porte : une journée (ou aucune) et ses sujets. */
interface Question {
  readonly date: string | null;
  readonly subjects: Set<VersionSubject>;
}

/** La clé d'un numéro : un sujet journalier est daté, un sujet global ne l'est pas. */
function keyOf(subject: VersionSubject, date: string | null): string {
  return isGlobal(subject) ? subject : `${subject}|${date ?? ''}`;
}

/** Le numéro de la copie de l'écran pour cette clé, si l'écran en tient une. */
function heldOf(spec: VersionWatch, key: string): number | undefined {
  const subject = isGlobalKey(key) ? key : null;
  return subject === null ? undefined : (spec.held?.(subject) ?? undefined);
}

function isGlobalKey(key: string): key is GlobalVersionSubject {
  return Object.hasOwn(GLOBAL_SUBJECTS, key);
}

function subjectsOf(spec: VersionWatch): readonly VersionSubject[] {
  return typeof spec.subjects === 'function' ? spec.subjects() : spec.subjects;
}

/** Les clés que suit un écran ; un sujet journalier sans journée connue n'en a pas. */
function keysOf(spec: VersionWatch): string[] {
  const date = spec.date?.() ?? null;
  return subjectsOf(spec)
    .filter((subject) => isGlobal(subject) || date !== null)
    .map((subject) => keyOf(subject, date));
}

/**
 * **Le veilleur unique** (`documentation/caching-usage/plan-veilleur-unique.md`,
 * § 3.4) : toutes les 15 s, onglet visible, il demande « les numéros ont-ils
 * changé ? » pour TOUS les écrans ouverts, et ne relit que ceux dont un sujet
 * a bougé.
 *
 * - 🔴 **Égalité, jamais ordre.** Un journal balayé fait REDESCENDRE un
 *   numéro (contrat `versionsViewSchema`) : un numéro différent est un
 *   changement, qu'il monte ou qu'il descende.
 * - **Une requête par tour et par journée affichée**, tous sujets réunis ;
 *   les sujets globaux montent dans la première, ou font une requête sans
 *   date si aucun écran n'affiche de journée.
 * - **Une lecture en échec ne relit rien** et garde le numéro d'avant : le
 *   tour suivant reposera la question, le filet borne le retard. Un sujet
 *   ABSENT de la réponse (non permis) se traite comme une lecture en échec.
 * - Le premier numéro lu est une **référence**, pas un changement : l'écran
 *   vient de lire. Changer de journée repart de zéro.
 */
@Injectable({ providedIn: 'root' })
export class VersionWatcher {
  private readonly versions = inject(VersionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly watchers = new Set<Watcher>();
  private timer: number | null = null;
  private ticking = false;
  private readonly onVisibility = (): void => void this.tick();

  /**
   * Branche un écran. ⚠️ Dans un contexte d'injection (le constructeur) :
   * l'arrêt suit le `DestroyRef` de l'écran ou du store.
   */
  watch(spec: VersionWatch): void {
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

  /** Les questions du tour, puis chaque écran compare. */
  private async tick(): Promise<void> {
    if (this.ticking || document.visibilityState !== 'visible') {
      return;
    }
    this.ticking = true;
    try {
      this.followClock();
      const answers = new Map<string, number>();
      await Promise.all(this.questions().map((question) => this.read(question, answers)));
      for (const watcher of this.watchers) {
        this.compare(watcher, answers);
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Les sujets de tous les écrans : une question par journée, les globaux dans la première. */
  private questions(): Question[] {
    const byDate = new Map<string, Set<VersionSubject>>();
    const globals = new Set<VersionSubject>();
    for (const watcher of this.watchers) {
      const date = watcher.spec.date?.() ?? null;
      for (const subject of subjectsOf(watcher.spec)) {
        if (isGlobal(subject)) {
          globals.add(subject);
        } else if (date !== null) {
          const subjects = byDate.get(date) ?? new Set<VersionSubject>();
          subjects.add(subject);
          byDate.set(date, subjects);
        }
      }
    }
    const questions: Question[] = [...byDate].map(([date, subjects]) => ({ date, subjects }));
    const first = questions[0];
    if (first !== undefined) {
      globals.forEach((subject) => first.subjects.add(subject));
    } else if (globals.size > 0) {
      questions.push({ date: null, subjects: globals });
    }
    return questions;
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

  /** Range dans `answers` les numéros rendus ; un échec n'y range rien. */
  private async read(question: Question, answers: Map<string, number>): Promise<void> {
    try {
      const versions = await this.versions.versions(question.date, [...question.subjects]);
      for (const subject of question.subjects) {
        const version = versions[subject];
        if (version !== undefined) {
          answers.set(keyOf(subject, question.date), version);
        }
      }
    } catch {
      // Rien relu : le tour suivant reposera la question, le filet borne le retard.
    }
  }

  private compare(watcher: Watcher, answers: ReadonlyMap<string, number>): void {
    // En pleine relecture, on ne note rien : le changement sera revu au tour suivant.
    if (watcher.reloading) {
      return;
    }
    const keys = keysOf(watcher.spec);
    for (const key of watcher.seen.keys()) {
      if (!keys.includes(key)) {
        watcher.seen.delete(key);
      }
    }
    let changed = false;
    for (const key of keys) {
      const version = answers.get(key);
      if (version === undefined) {
        continue;
      }
      const previous = heldOf(watcher.spec, key) ?? watcher.seen.get(key);
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
