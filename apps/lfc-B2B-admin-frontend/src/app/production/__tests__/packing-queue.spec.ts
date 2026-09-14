import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PackingQueue, type QueuedPackingMark } from '../packing-queue';
import { PackingService } from '../packing.service';

/** La clé d'un envoi : une ligne d'un bac d'une journée. */
function keyOf(date: string, reference: string, sku: string): string {
  return `${date} ${reference} ${sku}`;
}

class FakeService {
  readonly sent: QueuedPackingMark[] = [];
  /** Ce que le serveur répond à un envoi, par `date référence sku`. */
  readonly answer = new Map<string, unknown>();

  async mark(
    date: string,
    reference: string,
    sku: string,
    packed: boolean,
    initials: string,
  ): Promise<void> {
    const response = this.answer.get(keyOf(date, reference, sku));
    if (response !== undefined) {
      throw response;
    }
    this.sent.push({ date, reference, sku, packed, initials });
  }
}

function queue(api: FakeService): PackingQueue {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: PackingService, useValue: api }] });
  return TestBed.inject(PackingQueue);
}

const CROISSANTS: QueuedPackingMark = {
  date: '2026-09-14',
  reference: 'ORD-1',
  sku: 'CRO',
  packed: true,
  initials: 'MJ',
};
const BAGUETTES: QueuedPackingMark = { ...CROISSANTS, sku: 'BAG' };

describe('la file du colisage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Régression : un refus définitif bloquait la file à vie — la même mécanique
   * que la fiche d'atelier, copiée jusqu'au défaut (corrigé le 2026-09-14).
   */
  it('🔴 écarte un geste refusé pour de bon, et envoie ceux d’après', async () => {
    const api = new FakeService();
    api.answer.set(
      keyOf('2026-09-14', 'ORD-1', 'CRO'),
      new HttpErrorResponse({
        status: 409,
        error: { message: 'Croissant n’est pas encore sorti du four.' },
      }),
    );
    const q = queue(api);

    q.mark(CROISSANTS);
    q.mark(BAGUETTES);
    await q.flush();

    expect(api.sent).toEqual([BAGUETTES]);
    expect(q.pending()).toBe(0);
    expect(q.rejected()).toEqual([
      { mark: CROISSANTS, message: 'Croissant n’est pas encore sorti du four.' },
    ]);
  });

  it('garde en tête ce qui n’a pas pu partir, sans rien écarter', async () => {
    const api = new FakeService();
    api.answer.set(keyOf('2026-09-14', 'ORD-1', 'CRO'), new Error('réseau'));
    const q = queue(api);

    q.mark(CROISSANTS);
    q.mark(BAGUETTES);
    await q.flush();

    expect(api.sent).toEqual([]);
    expect(q.pending()).toBe(2);
    expect(q.rejected()).toEqual([]);
  });

  it('distingue deux bacs : le refus d’une ligne chez un client n’efface pas l’autre', async () => {
    const api = new FakeService();
    api.answer.set(keyOf('2026-09-14', 'ORD-1', 'CRO'), new HttpErrorResponse({ status: 409 }));
    const q = queue(api);
    const autreBac: QueuedPackingMark = { ...CROISSANTS, reference: 'ORD-2' };

    q.mark(CROISSANTS);
    q.mark(autreBac);
    await q.flush();

    expect(api.sent).toEqual([autreBac]);
    expect(q.rejected().map((rejected) => rejected.mark)).toEqual([CROISSANTS]);
  });

  it('oublie le refus d’une ligne dès qu’on la recoche, et tous quand on en prend acte', async () => {
    const api = new FakeService();
    api.answer.set(keyOf('2026-09-14', 'ORD-1', 'CRO'), new HttpErrorResponse({ status: 409 }));
    api.answer.set(keyOf('2026-09-14', 'ORD-1', 'BAG'), new HttpErrorResponse({ status: 409 }));
    const q = queue(api);
    q.mark(CROISSANTS);
    q.mark(BAGUETTES);
    await q.flush();
    expect(q.rejected()).toHaveLength(2);

    api.answer.delete(keyOf('2026-09-14', 'ORD-1', 'CRO'));
    q.mark(CROISSANTS);
    await q.flush();
    expect(q.rejected().map((rejected) => rejected.mark)).toEqual([BAGUETTES]);

    q.acknowledge();
    expect(q.rejected()).toEqual([]);
  });
});
