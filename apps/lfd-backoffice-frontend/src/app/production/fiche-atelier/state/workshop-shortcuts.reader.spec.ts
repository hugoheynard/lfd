import { TestBed } from '@angular/core/testing';
import type { WorkshopShortcutsView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { BatchShortcutsService } from '../../batch-shortcuts.service';
import { WorkshopShortcutsReader } from './workshop-shortcuts.reader';

function readerServing(workshop: () => Promise<WorkshopShortcutsView>): {
  reader: WorkshopShortcutsReader;
  calls: ReturnType<typeof vi.fn>;
} {
  const calls = vi.fn(workshop);
  TestBed.configureTestingModule({
    providers: [
      WorkshopShortcutsReader,
      { provide: BatchShortcutsService, useValue: { workshop: calls } },
    ],
  });
  return { reader: TestBed.inject(WorkshopShortcutsReader), calls };
}

describe('les raccourcis de la fiche d’atelier', () => {
  it('est vide avant la lecture', () => {
    const { reader, calls } = readerServing(() => Promise.resolve({ bySku: {} }));

    expect(reader.bySku().size).toBe(0);
    expect(calls).not.toHaveBeenCalled();
  });

  it('range les raccourcis servis par SKU, en une seule lecture', async () => {
    const { reader, calls } = readerServing(() =>
      Promise.resolve({
        bySku: {
          CRO: [{ id: 'bs-1', label: '1 plaque', pieces: 30 }],
          PAIN: [
            { id: 'bs-2', label: '1 four', pieces: 12 },
            { id: 'bs-3', label: '2 fours', pieces: 24 },
          ],
        },
      }),
    );

    await reader.load();

    expect(calls).toHaveBeenCalledTimes(1);
    expect(reader.bySku().get('CRO')).toEqual([{ id: 'bs-1', label: '1 plaque', pieces: 30 }]);
    expect(reader.bySku().get('PAIN')).toHaveLength(2);
    expect(reader.bySku().has('ABSENT')).toBe(false);
  });

  it('garde ce qu’il avait et ne lève pas quand la lecture échoue', async () => {
    let fail = false;
    const { reader } = readerServing(() =>
      fail
        ? Promise.reject(new Error('réseau'))
        : Promise.resolve({ bySku: { CRO: [{ id: 'bs-1', label: '1 plaque', pieces: 30 }] } }),
    );
    await reader.load();
    fail = true;

    await expect(reader.load()).resolves.toBeUndefined();

    expect(reader.bySku().get('CRO')).toHaveLength(1);
  });

  it('reste vide quand la première lecture échoue', async () => {
    const { reader } = readerServing(() => Promise.reject(new Error('réseau')));

    await reader.load();

    expect(reader.bySku().size).toBe(0);
  });
});
