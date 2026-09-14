import { HttpErrorResponse } from '@angular/common/http';
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
  /** Les envois refusés par le SERVEUR, avec leur réponse, par `date sku`. */
  readonly answer = new Map<string, HttpErrorResponse>();

  async mark(date: string, sku: string, done: boolean, initials: string): Promise<void> {
    const response = this.answer.get(`${date} ${sku}`);
    if (response !== undefined) {
      throw response;
    }
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

  /**
   * Régression : un refus définitif bloquait la file à vie. Tout échec arrêtait
   * le vidage et gardait le geste en tête ; une ligne cochée avant l'arrêt du
   * plan retenait donc toutes les coches d'après (constaté en dev le 2026-09-14).
   */
  it('🔴 écarte un geste refusé pour de bon, et envoie ceux d’après', async () => {
    const api = new FakeService();
    api.answer.set(
      '2026-09-13 BAG',
      new HttpErrorResponse({ status: 409, error: { message: 'Le plan du 13 n’est pas arrêté.' } }),
    );
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    q.mark({ date: '2026-09-13', sku: 'CRO', done: true, initials: 'MJ' });
    await q.flush();

    expect(api.sent).toEqual([{ date: '2026-09-13', sku: 'CRO', done: true, initials: 'MJ' }]);
    expect(q.pending()).toBe(0);
    expect(q.rejected()).toEqual([
      {
        mark: { date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' },
        message: 'Le plan du 13 n’est pas arrêté.',
      },
    ]);
  });

  it('garde en tête un geste que le serveur n’a pas jugé — un 503 n’est pas un refus', async () => {
    const api = new FakeService();
    api.answer.set('2026-09-13 BAG', new HttpErrorResponse({ status: 503 }));
    const q = queue(api);

    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    q.mark({ date: '2026-09-13', sku: 'CRO', done: true, initials: 'MJ' });
    await q.flush();

    expect(api.sent).toEqual([]);
    expect(q.pending()).toBe(2);
    expect(q.rejected()).toEqual([]);
  });

  it('oublie le refus d’une ligne dès qu’on la recoche', async () => {
    const api = new FakeService();
    api.answer.set('2026-09-13 BAG', new HttpErrorResponse({ status: 409 }));
    const q = queue(api);
    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();
    expect(q.rejected()).toHaveLength(1);

    api.answer.clear();
    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();

    expect(q.rejected()).toEqual([]);
    expect(api.sent).toHaveLength(1);
  });

  it('oublie les refus quand on en prend acte', async () => {
    const api = new FakeService();
    api.answer.set('2026-09-13 BAG', new HttpErrorResponse({ status: 404 }));
    const q = queue(api);
    q.mark({ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' });
    await q.flush();
    expect(q.rejected()).toHaveLength(1);

    q.acknowledge();

    expect(q.rejected()).toEqual([]);
  });

  it('se remet d’une file empoisonnée laissée par une session précédente', async () => {
    // Le cas exact du 2026-09-14 : le poison était DÉJÀ dans le stockage au
    // chargement. Le vidage du constructeur doit l'écarter sans attendre un clic.
    localStorage.setItem(
      'lfc.admin.worksheet-queue',
      JSON.stringify([{ date: '2026-09-13', sku: 'BAG', done: true, initials: 'MJ' }]),
    );
    const api = new FakeService();
    api.answer.set('2026-09-13 BAG', new HttpErrorResponse({ status: 409 }));
    const q = queue(api);

    await q.flush();

    expect(q.pending()).toBe(0);
    expect(q.rejected()).toHaveLength(1);
    expect(localStorage.getItem('lfc.admin.worksheet-queue')).toBe('[]');
  });
});
