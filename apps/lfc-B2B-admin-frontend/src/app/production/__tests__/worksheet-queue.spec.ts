import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorksheetQueue } from '../worksheet-queue';
import { WorksheetService } from '../worksheet.service';

/** Ce que la file demande vraiment au réseau — et rien d'autre. */
interface Sent {
  readonly date: string;
  readonly sku: string;
  readonly done: boolean;
  readonly initials: string;
}

class FakeService {
  readonly sent: Sent[] = [];
  /** Les envois qui doivent échouer, par `date sku`. */
  readonly refuse = new Set<string>();

  async mark(date: string, sku: string, done: boolean, initials: string): Promise<void> {
    if (this.refuse.has(`${date} ${sku}`)) {
      throw new Error('réseau');
    }
    this.sent.push({ date, sku, done, initials });
  }
}

function queue(api: FakeService): WorksheetQueue {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: WorksheetService, useValue: api }] });
  return TestBed.inject(WorksheetQueue);
}

describe('la file des coches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('envoie une coche et ne garde rien derrière elle', async () => {
    const api = new FakeService();
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();

    expect(api.sent).toEqual([{ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' }]);
    expect(q.pending()).toBe(0);
  });

  it('🔴 garde le geste qui n’est pas parti, et le DIT', async () => {
    // Jamais un écran qui a l'air d'avoir enregistré alors que non : c'est
    // `pending` que le pied affiche.
    const api = new FakeService();
    api.refuse.add('2026-09-13 BAG');
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();

    expect(api.sent).toEqual([]);
    expect(q.pending()).toBe(1);
  });

  it('n’envoie que le DERNIER geste d’une même ligne', async () => {
    // Recocher puis décocher à 4 h du matin ne doit pas envoyer deux ordres
    // contradictoires : la file est par (date, sku), et le dernier écrase.
    const api = new FakeService();
    api.refuse.add('2026-09-13 BAG');
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();
    q.mark({ date: '2026-09-13', sku: 'BAG', done: false, initials: 'MJ' });
    expect(q.pending()).toBe(1);

    api.refuse.clear();
    await q.flush();

    expect(api.sent).toEqual([{ date: '2026-09-13', sku: 'BAG', done: false, initials: 'MJ' }]);
  });

  it('sépare deux journées : la même ligne, deux jours, deux gestes', async () => {
    const api = new FakeService();
    api.refuse.add('2026-09-13 BAG');
    api.refuse.add('2026-09-14 BAG');
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    q.mark({ date: '2026-09-14', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();

    expect(q.pending()).toBe(2);
  });

  it('rejoue à la reconnexion ce que la session précédente n’a pas pu envoyer', async () => {
    const api = new FakeService();
    api.refuse.add('2026-09-13 BAG');
    const first = queue(api);
    first.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await first.flush();
    expect(first.pending()).toBe(1);

    // Une instance neuve : c'est bien le STOCKAGE qui a porté le geste, pas
    // l'objet — une coche d'hier soir ne dépend pas de qui rouvre la fiche.
    api.refuse.clear();
    const second = queue(api);
    await second.flush();

    expect(api.sent).toEqual([{ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' }]);
    expect(second.pending()).toBe(0);
  });

  it('repart d’une file vide sur un stockage illisible plutôt que de rejouer une forme inconnue', async () => {
    localStorage.setItem('lfc.admin.worksheet-queue', '{"pas":"un tableau"}');
    const api = new FakeService();
    const q = queue(api);

    await q.flush();

    expect(q.pending()).toBe(0);
    expect(api.sent).toEqual([]);
  });
});
