import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { markKey } from '../../worksheet-day';

/**
 * Une fournée déclarée sans que le serveur ait répondu, gardée sur l'appareil
 * jusqu'à ce qu'elle parte. Son `id` est la clé d'idempotence : rejouée, elle
 * ne compte qu'une fois, même si le serveur l'avait déjà écrite.
 */
export interface QueuedBatch {
  readonly kind: 'batch';
  readonly id: string;
  readonly date: string;
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly initials: string;
}

/**
 * Un « Fait » (niveau simple) parti sans réponse. Son `id` est la clé
 * d'intention du geste : rejoué, il ne déclare qu'une fois.
 */
export interface QueuedDone {
  readonly kind: 'done';
  readonly id: string;
  readonly date: string;
  readonly sku: string;
  readonly productName: string;
}

/** Un geste gardé dans la file. */
export type QueuedGesture = QueuedBatch | QueuedDone;

/** Ce qu'une ligne a en route, montré à part des chiffres servis. */
export interface LinePending {
  readonly quantity: number;
  /** `sending` : l'envoi est en cours ; `queued` : gardée, elle attend le réseau. */
  readonly state: 'sending' | 'queued';
}

/** Une version dans la clé : une forme changée ne se relit pas comme l'ancienne. */
const STORAGE_KEY = 'lfd.workshop.outbox.v2';

/**
 * **Les gestes en route de la fiche d'atelier** — la fournée dont l'envoi est
 * en cours (en mémoire), et la file : les fournées et les « Fait » partis sans
 * réponse (réseau coupé, wifi du fournil), gardés dans le stockage de
 * l'appareil pour survivre à un rechargement, et rejoués par
 * `WorkshopQueueReplay` au retour du réseau.
 *
 * Elle ne fait que garder : elle n'envoie rien, ne décide rien et ne compte
 * rien. Ce qu'elle contient n'est jamais additionné aux chiffres servis — la
 * fiche ne calcule rien ; une fournée en file se montre à part, « en attente ».
 *
 * Le stockage peut manquer (navigation privée, quota, rendu serveur) : la file
 * tient alors pour la session seulement.
 */
@Injectable()
export class WorkshopOutbox {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly queue = signal<readonly QueuedGesture[]>(this.read());
  readonly entries = this.queue.asReadonly();
  /** Par ligne (`markKey`), la quantité dont l'envoi est en cours — en mémoire seulement. */
  private readonly sending = signal<ReadonlyMap<string, number>>(new Map());

  /** L'envoi en cours d'une quantité sur une ligne (`markKey`) ; `null` quand il est fini. */
  setSending(key: string, quantity: number | null): void {
    this.sending.update((all) => {
      const next = new Map(all);
      if (quantity === null) {
        next.delete(key);
      } else {
        next.set(key, quantity);
      }
      return next;
    });
  }

  /** Ce que la ligne a en route : l'envoi en cours d'abord, puis la file. */
  pendingOf(date: string | null, sku: string): LinePending | null {
    if (date === null) {
      return null;
    }
    const sending = this.sending().get(markKey(date, sku));
    if (sending !== undefined) {
      return { quantity: sending, state: 'sending' };
    }
    const waiting = this.waitingFor(date, sku);
    return waiting > 0 ? { quantity: waiting, state: 'queued' } : null;
  }

  /** Ajoute un geste ; un geste déjà en file (même `id`) n'est pas doublé. */
  add(entry: QueuedGesture): void {
    this.update((all) => [...all.filter((queued) => queued.id !== entry.id), entry]);
  }

  remove(id: string): void {
    this.update((all) => all.filter((queued) => queued.id !== id));
  }

  /** La fournée en file pour cette ligne et cette quantité : un nouvel appui la rejoue. */
  findBatch(date: string, sku: string, quantity: number): QueuedBatch | undefined {
    return this.batchesOf(date, sku).find((queued) => queued.quantity === quantity);
  }

  /** Le « Fait » en file pour cette ligne : un nouvel appui le rejoue. */
  findDone(date: string, sku: string): QueuedDone | undefined {
    return this.queue().find(
      (queued): queued is QueuedDone =>
        queued.kind === 'done' && queued.date === date && queued.sku === sku,
    );
  }

  /** Un « Fait » de cette ligne attend-il le réseau ? */
  doneWaiting(date: string | null, sku: string): boolean {
    return date !== null && this.findDone(date, sku) !== undefined;
  }

  /** Ce qui attend pour une ligne de la journée, en pièces. */
  waitingFor(date: string, sku: string): number {
    return this.batchesOf(date, sku).reduce((sum, queued) => sum + queued.quantity, 0);
  }

  private batchesOf(date: string, sku: string): readonly QueuedBatch[] {
    return this.queue().filter(
      (queued): queued is QueuedBatch =>
        queued.kind === 'batch' && queued.date === date && queued.sku === sku,
    );
  }

  private update(change: (all: readonly QueuedGesture[]) => readonly QueuedGesture[]): void {
    this.queue.update(change);
    this.write(this.queue());
  }

  private read(): readonly QueuedGesture[] {
    if (!this.isBrowser) {
      return [];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      // Une entrée illisible est écartée, pas devinée : on ne rejoue pas une
      // geste dont on ne sait pas ce qu'il déclare.
      return Array.isArray(parsed) ? parsed.filter(isQueuedGesture) : [];
    } catch {
      return [];
    }
  }

  private write(entries: readonly QueuedGesture[]): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      if (entries.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      }
    } catch {
      // Stockage refusé : la file tient pour la session, et le bandeau le montre.
    }
  }
}

/** Le type de chaque champ, par sorte de geste. */
const FIELDS: {
  readonly [K in QueuedGesture['kind']]: Readonly<Record<string, 'string' | 'number'>>;
} = {
  batch: {
    id: 'string',
    date: 'string',
    sku: 'string',
    productName: 'string',
    quantity: 'number',
    initials: 'string',
  },
  done: { id: 'string', date: 'string', sku: 'string', productName: 'string' },
};

function isQueuedGesture(value: unknown): value is QueuedGesture {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const kind: unknown = Reflect.get(value, 'kind');
  if (kind !== 'batch' && kind !== 'done') {
    return false;
  }
  return Object.entries(FIELDS[kind]).every(
    ([key, type]) => typeof Reflect.get(value, key) === type,
  );
}
