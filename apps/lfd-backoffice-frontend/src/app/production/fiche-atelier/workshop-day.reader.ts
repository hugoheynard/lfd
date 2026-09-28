import { computed, inject, Injectable, signal } from '@angular/core';

import type { ProductionWorksheetView } from '@lfd/contracts';

import { dayLabelOf, hourLabel, RELATIVE_DAY_LABEL } from '../worksheet-day';
import { WorksheetService } from '../worksheet.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **CE QU'ON LIT** à la fiche d'atelier — la journée servie, ses fiches déjà
 * groupées et comptées, et tout ce qui dit de quand elle date.
 *
 * Fourni par l'écran (`providers` de `FicheAtelier`), pas à la racine : un poste
 * ouvert deux fois ne partage pas sa lecture. Même découpe que `PackingDayReader`
 * (2026-09-14).
 *
 * 🔴 **Il ne calcule rien.** La journée travaillée est choisie au serveur
 * (`GET …/worksheet/current`), le mot « demain » aussi (`relativeDay`), et les
 * fiches arrivent rangées, séparées et comptées (`groups`). L'horloge du poste ne
 * sert plus qu'à dire « relue à ».
 *
 * Il porte aussi les lignes dont un geste est en vol (`busy`) : leurs boutons
 * sont désarmés le temps de l'envoi.
 */
@Injectable()
export class WorkshopDayReader {
  private readonly api = inject(WorksheetService);

  private readonly loadState = signal<LoadState>('loading');
  readonly state = this.loadState.asReadonly();

  private readonly view = signal<ProductionWorksheetView | null>(null);

  /** La journée LUE — celle de la dernière réponse. `null` avant la première. */
  readonly date = computed(() => this.view()?.date ?? null);

  /** « samedi 16 août » — l'en-tête de la fiche. */
  readonly dayLabel = computed(() => {
    const day = this.date();
    return day === null ? '' : dayLabelOf(day);
  });

  /** « aujourd'hui » ou « demain », tel que le SERVEUR le dit. Vide sinon. */
  readonly dayOffset = computed(() => {
    const relative = this.view()?.relativeDay ?? null;
    return relative === null ? '' : RELATIVE_DAY_LABEL[relative];
  });

  /** Les fiches, une par rayon, dans l'ordre et avec les comptes du serveur. */
  readonly groups = computed(() => this.view()?.groups ?? []);

  /**
   * 🔴 La lecture des rayons a-t-elle échoué au serveur ? La fiche reste juste —
   * les quantités ne dépendent pas du catalogue — mais tout est sous « Rayon
   * inconnu », et l'écran doit le dire.
   */
  readonly shelvesLost = computed(() => this.view()?.shelvesKnown === false);

  readonly drift = computed(() => this.view()?.drift ?? null);

  /** « 4 h 05 », l'heure du tirage. `null` = le plan n'est pas arrêté. */
  readonly generatedLabel = computed(() => hourLabel(this.view()?.generatedAt ?? null));

  /** L'heure du dernier retirage, si la journée en a connu un. */
  readonly retakenLabel = computed(() => hourLabel(this.view()?.retakenAt ?? null));

  /** L'instant ISO de la dernière lecture réussie. */
  private readonly readAt = signal<string | null>(null);
  /** « 4 h 12 » — le pied dit de quand date l'écran. */
  readonly readLabel = computed(() => hourLabel(this.readAt()));

  /**
   * La dernière relecture a-t-elle échoué ? La fiche reste à l'écran, mais le
   * pied dit depuis quand elle n'a pas bougé : un écran figé qui a l'air vivant
   * fait cocher deux fois la même ligne.
   */
  private readonly readFailed = signal(false);
  readonly refreshFailed = this.readFailed.asReadonly();

  /**
   * La journée vers laquelle la fiche vient de basculer **pendant qu'on la
   * regardait**. 🔴 Le soir, le plan du lendemain arrêté, la relecture fait passer
   * la fiche à demain ; un écran qui change de journée sans prévenir ferait
   * cocher le mauvais jour. La comparaison porte sur deux dates SERVIES.
   */
  private readonly turnedTo = signal<string | null>(null);
  readonly dayTurnedLabel = computed(() => {
    const day = this.turnedTo();
    return day === null ? null : dayLabelOf(day);
  });

  /** Les lignes dont un geste est en train de partir, par `markKey` — désarmées. */
  private readonly busyMarks = signal<ReadonlySet<string>>(new Set());
  readonly busy = this.busyMarks.asReadonly();

  /** Le rang de la dernière lecture lancée. Une réponse lente n'écrase jamais une plus récente. */
  private readSeq = 0;

  /**
   * L'instant de la dernière écriture acceptée. Une relecture PÉRIODIQUE partie
   * avant elle rendrait l'état d'avant : sa réponse est jetée.
   */
  private lastWriteAt = 0;

  /** **La lecture initiale** — avec écran de chargement. */
  async load(): Promise<void> {
    this.loadState.set('loading');
    const served = await this.read();
    if (served === 'stale') {
      return;
    }
    if (served === 'failed') {
      this.loadState.set('error');
      return;
    }
    this.applyRead(served);
    this.loadState.set('ready');
  }

  /**
   * **La relecture silencieuse** — toutes les 15 s tant que l'onglet est visible.
   * Pas d'écran de chargement, la fiche ouverte ne bouge pas.
   *
   * 🔴 Une réponse est **jetée** si une fournée a été acceptée après son départ :
   * elle rendrait l'état d'avant, et l'effacerait sous les doigts.
   */
  async refresh(): Promise<void> {
    if (this.loadState() !== 'ready') {
      return;
    }
    const startedAt = Date.now();
    const served = await this.read();
    if (served === 'failed') {
      this.readFailed.set(true);
    } else if (served !== 'stale' && this.lastWriteAt < startedAt) {
      this.applyRead(served);
    }
  }

  /**
   * **La relecture qui suit une écriture acceptée.** Elle note l'écriture, puis
   * relit.
   *
   * 🔴 Elle n'est PAS soumise à la règle `lastWriteAt` : l'écriture et son départ
   * tombent dans la même milliseconde, et la règle jetterait la lecture qui porte
   * le geste qu'on vient de faire. Elle passe devant toute relecture périodique
   * en vol par le rang. Rend `true` si elle a été inscrite.
   */
  async rereadAfterWrite(): Promise<boolean> {
    this.lastWriteAt = Date.now();
    const served = await this.read();
    if (served === 'failed') {
      this.readFailed.set(true);
      return false;
    }
    if (served === 'stale') {
      return false;
    }
    this.applyRead(served);
    return true;
  }

  /** La personne a vu que la fiche a changé de journée. */
  acknowledgeDayTurn(): void {
    this.turnedTo.set(null);
  }

  /** Marque un geste d'une ligne comme parti, ou revenu. */
  setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busyMarks());
    if (busy) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.busyMarks.set(next);
  }

  /**
   * Lit la journée travaillée, avec son rang. `stale` = une lecture partie après
   * elle a déjà la main ; `failed` = la lecture a échoué et c'était la dernière.
   */
  private async read(): Promise<ProductionWorksheetView | 'stale' | 'failed'> {
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.api.current();
      return seq === this.readSeq ? served : 'stale';
    } catch {
      return seq === this.readSeq ? 'failed' : 'stale';
    }
  }

  /**
   * Inscrit une lecture réussie. La journée est celle de la RÉPONSE ; si elle
   * diffère de la précédente, l'écran le dit.
   */
  private applyRead(served: ProductionWorksheetView): void {
    const previousDay = this.date();
    this.view.set(served);
    if (previousDay !== null && previousDay !== served.date) {
      this.turnedTo.set(served.date);
    }
    this.readAt.set(new Date().toISOString());
    this.readFailed.set(false);
  }
}
