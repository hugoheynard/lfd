import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PackingContainersService } from '../packing-containers.service';
import { PackingContainerGestures } from './packing-container-gestures';
import { PackingDayReader } from './packing-day.reader';

/**
 * Ce que ces cas tiennent : répartir, retirer et déplacer sont des deltas ;
 * chacun porte une clé d'intention, gardée jusqu'au succès (un réessai après
 * un refus ou une coupure ne double rien) et renouvelée après (le geste
 * suivant compte).
 */

/** Le serveur doublé : il note la clé de chaque envoi, et peut refuser le prochain. */
class KeyedContainers {
  readonly keys: string[] = [];
  refuseNext = false;

  allocate(...args: readonly [string, string, string, string, number, string]): Promise<void> {
    return this.receive(args[5]);
  }

  withdraw(...args: readonly [string, string, string, string, number, string]): Promise<void> {
    return this.receive(args[5]);
  }

  transfer(
    ...args: readonly [string, string, string, string, string, number, string]
  ): Promise<void> {
    return this.receive(args[6]);
  }

  private receive(key: string): Promise<void> {
    this.keys.push(key);
    if (this.refuseNext) {
      this.refuseNext = false;
      return Promise.reject(new HttpErrorResponse({ status: 0 }));
    }
    return Promise.resolve();
  }
}

let api: KeyedContainers;
let gestures: PackingContainerGestures;

beforeEach(() => {
  api = new KeyedContainers();
  TestBed.configureTestingModule({
    providers: [
      PackingContainerGestures,
      { provide: PackingContainersService, useValue: api },
      {
        provide: PackingDayReader,
        useValue: { date: () => '2026-10-05', rereadAfterWrite: () => Promise.resolve(true) },
      },
    ],
  });
  gestures = TestBed.inject(PackingContainerGestures);
});

describe('PackingContainerGestures — une clé par geste voulu', () => {
  it('répartir : un réessai après une coupure repart avec la même clé', async () => {
    api.refuseNext = true;

    expect(await gestures.allocate('o-1', 'c-1', 'CRO', 4)).toBe(false);
    expect(await gestures.allocate('o-1', 'c-1', 'CRO', 4)).toBe(true);

    expect(api.keys).toHaveLength(2);
    expect(api.keys[0]).toBe(api.keys[1]);
  });

  it('répartir : après un succès, le geste suivant porte une clé neuve', async () => {
    await gestures.allocate('o-1', 'c-1', 'CRO', 4);
    await gestures.allocate('o-1', 'c-1', 'CRO', 4);

    expect(api.keys).toHaveLength(2);
    expect(api.keys[0]).not.toBe(api.keys[1]);
  });

  it('retirer : la clé est gardée sur un refus, oubliée sur un succès', async () => {
    api.refuseNext = true;
    await gestures.withdraw('o-1', 'c-1', 'CRO', 2);
    await gestures.withdraw('o-1', 'c-1', 'CRO', 2);
    await gestures.withdraw('o-1', 'c-1', 'CRO', 2);

    expect(api.keys[0]).toBe(api.keys[1]);
    expect(api.keys[2]).not.toBe(api.keys[1]);
  });

  it('déplacer : la clé est gardée sur un refus, oubliée sur un succès', async () => {
    api.refuseNext = true;
    await gestures.transfer('o-1', 'c-1', 'CRO', 'c-2', 3);
    await gestures.transfer('o-1', 'c-1', 'CRO', 'c-2', 3);
    await gestures.transfer('o-1', 'c-1', 'CRO', 'c-2', 3);

    expect(api.keys[0]).toBe(api.keys[1]);
    expect(api.keys[2]).not.toBe(api.keys[1]);
  });

  it('deux gestes distincts ne partagent pas leur clé', async () => {
    api.refuseNext = true;
    await gestures.allocate('o-1', 'c-1', 'CRO', 4);
    await gestures.withdraw('o-1', 'c-1', 'CRO', 4);

    expect(api.keys[0]).not.toBe(api.keys[1]);
  });
});
