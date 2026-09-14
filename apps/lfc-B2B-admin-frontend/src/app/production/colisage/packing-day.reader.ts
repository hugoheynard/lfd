import { computed, inject, Injectable, signal } from '@angular/core';

import type { ProductionPackingView } from '@lfd/contracts';

import { PackingService } from '../packing.service';
import { dayLabelOf, hourLabel, isoDay, nextDay, RELATIVE_DAY_LABEL } from '../worksheet-day';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **CE QU'ON LIT** au poste de colisage — la journée servie, et tout ce qui dit
 * de quand elle date.
 *
 * Fourni par l'écran (`providers` de `Colisage`), pas à la racine : un poste
 * ouvert deux fois ne partage pas sa lecture. Sorti de `Colisage` le 2026-09-14.
 *
 * Il ne connaît NI la navigation NI les gestes. C'est pour ça que la relecture
 * périodique n'est pas enregistrée ici : l'écran l'enregistre, capture la
 * commande ouverte, attend {@link refresh} et compare. L'enregistrer ici aurait
 * obligé le lecteur à connaître la commande ouverte, ou à un `effect` lisant ce
 * qu'il écrit.
 *
 * 🔴 **Il porte aussi l'état montré des cases et les coches en vol** (`shown`,
 * `busy`) : {@link applyRead} les efface. Les confier aux gestes aurait fait deux
 * propriétaires pour une même règle — « une lecture inscrite remplace l'état
 * montré, sauf ce qui est encore en vol ».
 */
@Injectable()
export class PackingDayReader {
  private readonly api = inject(PackingService);

  private readonly loadState = signal<LoadState>('loading');
  readonly state = this.loadState.asReadonly();

  private readonly view = signal<ProductionPackingView | null>(null);

  /**
   * La journée LUE — celle de la dernière réponse, jamais celle demandée. Sa
   * valeur initiale n'est qu'un marque-place le temps de la première lecture.
   */
  private readonly readDate = signal(isoDay(new Date()));
  readonly date = this.readDate.asReadonly();

  /** « samedi 16 août » — l'en-tête du poste. */
  readonly dayLabel = computed(() => dayLabelOf(this.readDate()));

  /** « aujourd'hui » ou « demain », tel que le SERVEUR le dit. Vide sinon. */
  readonly dayOffset = computed(() => {
    const relative = this.view()?.relativeDay ?? null;
    return relative === null ? '' : RELATIVE_DAY_LABEL[relative];
  });

  /** Les commandes de la journée, telles que servies. */
  readonly sheets = computed(() => this.view()?.sheets ?? []);

  /**
   * La marchandise à répartir, pour la journée entière et **telle que servie** :
   * l'écran ne la recompte plus. Le sélecteur de pile ne la touche pas.
   */
  readonly resources = computed(() => this.view()?.resources ?? []);

  /** Toutes les commandes de la journée — compté au serveur. */
  readonly orderCount = computed(() => this.view()?.orderCount ?? 0);
  /** Celles qui restent à préparer — compté au serveur. */
  readonly todoCount = computed(() => this.view()?.todoCount ?? 0);
  /** Celles déclarées prêtes — compté au serveur. */
  readonly readyCount = computed(() => this.view()?.readyCount ?? 0);

  /** La journée est-elle arrêtée ? `null` = il n'y a rien à coliser. */
  readonly closedAt = computed(() => this.view()?.closedAt ?? null);

  /** L'instant ISO de la dernière lecture réussie. */
  private readonly readAt = signal<string | null>(null);
  /** « 4 h 12 » — le pied dit de quand date la balance. */
  readonly readLabel = computed(() => hourLabel(this.readAt()));

  /**
   * La dernière relecture a-t-elle échoué ? Le poste reste à l'écran, mais le
   * pied dit depuis quand il n'a pas bougé : une balance figée qui a l'air à
   * jour fait répartir deux fois la même marchandise.
   */
  private readonly readFailed = signal(false);
  readonly refreshFailed = this.readFailed.asReadonly();

  /**
   * **L'état montré d'une case le temps de son envoi**, par
   * `AAAA-MM-JJ RÉFÉRENCE SKU` (`packingMarkKey`) — la seule chose que l'écran
   * garde. Un booléen : sans lui, un `fold-checkbox` cliqué ne reviendrait pas en
   * arrière sur un refus.
   */
  private readonly shownMarks = signal<ReadonlyMap<string, boolean>>(new Map());
  readonly shown = this.shownMarks.asReadonly();

  /** Les coches en train de partir, même clé — leur case est désarmée. */
  private readonly busyMarks = signal<ReadonlySet<string>>(new Set());
  readonly busy = this.busyMarks.asReadonly();

  /** Le rang de la dernière lecture lancée. Une réponse lente n'écrase jamais une plus récente. */
  private readSeq = 0;

  /**
   * L'instant de la dernière écriture acceptée. Une relecture PÉRIODIQUE partie
   * avant elle rendrait l'état d'avant : sa réponse est jetée. La relecture
   * d'après écriture n'y est pas soumise (voir {@link rereadAfterWrite}).
   */
  private lastWriteAt = 0;

  /**
   * **La lecture initiale** — avec écran de chargement. Rend la journée inscrite,
   * ou `null` si elle a échoué ou été devancée : l'écran s'en sert pour ouvrir la
   * commande que le QR désigne.
   */
  async load(): Promise<ProductionPackingView | null> {
    this.loadState.set('loading');
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq) {
        return null;
      }
      this.applyRead(served);
      this.loadState.set('ready');
      return served;
    } catch {
      if (seq === this.readSeq) {
        this.loadState.set('error');
      }
      return null;
    }
  }

  /**
   * **La relecture silencieuse** — celle que l'écran enregistre toutes les 15 s.
   * Pas d'écran de chargement : seul change ce que le serveur sait de nouveau.
   *
   * 🔴 Une réponse est **jetée** si une écriture a été acceptée après son
   * départ : elle rendrait l'état d'avant. Rend `true` si elle a été inscrite.
   */
  async refresh(): Promise<boolean> {
    if (this.loadState() !== 'ready') {
      return false;
    }
    this.readSeq += 1;
    const seq = this.readSeq;
    const startedAt = Date.now();
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq || this.lastWriteAt >= startedAt) {
        return false;
      }
      this.applyRead(served);
      return true;
    } catch {
      if (seq === this.readSeq) {
        this.readFailed.set(true);
      }
      return false;
    }
  }

  /**
   * **La relecture qui suit une écriture acceptée** — coche, containers ou
   * déclaration. Elle note l'écriture, puis relit.
   *
   * 🔴 **Elle n'est PAS soumise à la règle `lastWriteAt`**, et c'est tout ce qui
   * la sépare de {@link refresh} : l'écriture et son départ tombent dans la même
   * milliseconde, et la règle l'aurait jetée — c'est-à-dire aurait jeté la
   * lecture qui porte le geste qu'on vient de faire. Elle passe devant toute
   * relecture périodique en vol par le rang (`readSeq`).
   *
   * Rend `true` si elle a été inscrite ; `false` si elle a échoué (le pied le dit)
   * ou a été devancée.
   */
  async rereadAfterWrite(): Promise<boolean> {
    this.lastWriteAt = Date.now();
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq) {
        return false;
      }
      this.applyRead(served);
      return true;
    } catch {
      if (seq === this.readSeq) {
        this.readFailed.set(true);
      }
      return false;
    }
  }

  /** Pose ou retire l'état montré d'une case (`null` = retirer). */
  setShown(key: string, packed: boolean | null): void {
    const next = new Map(this.shownMarks());
    if (packed === null) {
      next.delete(key);
    } else {
      next.set(key, packed);
    }
    this.shownMarks.set(next);
  }

  /** Marque une coche comme partie, ou revenue. */
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
   * Inscrit une lecture réussie : la journée, sa date — celle de la RÉPONSE, pas
   * de la demande —, l'heure de lecture. L'état montré des cases s'efface, sauf
   * celui des cases dont l'envoi est encore en vol.
   */
  private applyRead(served: ProductionPackingView): void {
    this.view.set(served);
    this.readDate.set(served.date);
    this.readAt.set(new Date().toISOString());
    this.readFailed.set(false);
    const inFlight = this.busyMarks();
    this.shownMarks.set(new Map([...this.shownMarks()].filter(([key]) => inFlight.has(key))));
  }

  /**
   * **La journée que le fournil colise** : demain si son plan est arrêté,
   * aujourd'hui sinon.
   *
   * ⚠️ **Le seul endroit où l'horloge du poste décide encore quelque chose** :
   * QUELLE date demander. Le contrat n'offre qu'une lecture par date
   * (`GET …/packing?date=`) ; le passer au serveur demande une route de plus. Le
   * MOT affiché, lui, vient du serveur (`relativeDay`).
   */
  private async workedDay(): Promise<ProductionPackingView> {
    const tomorrow = await this.api.packing(isoDay(nextDay(new Date())));
    return tomorrow.closedAt === null ? this.api.packing(isoDay(new Date())) : tomorrow;
  }
}
