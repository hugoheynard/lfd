import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { type QueuedBatch, type QueuedDone, WorkshopOutbox } from './workshop-outbox';

const KEY = 'lfd.workshop.outbox.v2';

function batch(over: Partial<QueuedBatch> = {}): QueuedBatch {
  return {
    kind: 'batch',
    id: '01J0000000000000000000000A',
    date: '2026-11-20',
    sku: 'CRO',
    productName: 'Croissant au beurre',
    quantity: 30,
    initials: 'HH',
    ...over,
  };
}

function outbox(): WorkshopOutbox {
  TestBed.configureTestingModule({ providers: [WorkshopOutbox] });
  return TestBed.inject(WorkshopOutbox);
}

beforeEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
});

describe('la file d’envoi de la fiche', () => {
  it('garde une fournée sur l’appareil, et la relit après un rechargement', () => {
    outbox().add(batch());

    TestBed.resetTestingModule();
    expect(outbox().entries()).toEqual([batch()]);
  });

  it('ne double pas une fournée ajoutée deux fois', () => {
    const queue = outbox();
    queue.add(batch());
    queue.add(batch());
    expect(queue.entries()).toHaveLength(1);
  });

  it('retire une fournée partie, et vide le stockage quand la file est vide', () => {
    const queue = outbox();
    queue.add(batch());
    queue.remove(batch().id);
    expect(queue.entries()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('retrouve la fournée d’une ligne à la même quantité, pas à une autre', () => {
    const queue = outbox();
    queue.add(batch());
    expect(queue.findBatch('2026-11-20', 'CRO', 30)?.id).toBe(batch().id);
    expect(queue.findBatch('2026-11-20', 'CRO', 24)).toBeUndefined();
    expect(queue.findBatch('2026-11-21', 'CRO', 30)).toBeUndefined();
  });

  it('dit ce qui attend pour une ligne', () => {
    const queue = outbox();
    queue.add(batch());
    queue.add(batch({ id: '01J0000000000000000000000B', quantity: 24 }));
    expect(queue.waitingFor('2026-11-20', 'CRO')).toBe(54);
    expect(queue.waitingFor('2026-11-20', 'PAIN')).toBe(0);
  });

  it('écarte une entrée illisible au lieu de la deviner', () => {
    localStorage.setItem(KEY, JSON.stringify([batch(), { id: 'x', quantity: '30' }, 'texte']));
    expect(outbox().entries()).toEqual([batch()]);
  });

  it('un stockage illisible vaut une file vide', () => {
    localStorage.setItem(KEY, '{pas du json');
    expect(outbox().entries()).toEqual([]);
  });

  it('garde un « Fait » à part des fournées : il ne compte aucune pièce', () => {
    const done: QueuedDone = {
      kind: 'done',
      id: 'intent-1',
      date: '2026-11-20',
      sku: 'CRO',
      productName: 'Croissant au beurre',
    };
    const queue = outbox();
    queue.add(done);

    expect(queue.findDone('2026-11-20', 'CRO')).toEqual(done);
    expect(queue.waitingFor('2026-11-20', 'CRO')).toBe(0);
    expect(queue.findBatch('2026-11-20', 'CRO', 30)).toBeUndefined();
  });

  it('écarte une entrée sans sorte connue', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...batch(), kind: 'autre' }]));
    expect(outbox().entries()).toEqual([]);
  });
});
