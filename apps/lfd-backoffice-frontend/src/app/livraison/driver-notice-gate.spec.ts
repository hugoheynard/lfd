import { TestBed } from '@angular/core/testing';
import type { MyDriverNoticeView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DriverNoticeDialog } from './driver-notice-dialog/driver-notice-dialog';
import { DriverNoticeGate } from './driver-notice-gate';
import { DriverNoticeService } from './driver-notice.service';
import { myNoticeOf } from './driver-notice.fixture';

/**
 * Le serveur en mémoire : une version courante, et les versions accusées. Le
 * dialogue « J'ai compris » accuse, comme le vrai (`DriverNoticeDialog`).
 */
interface Wire {
  version: number;
  readonly acknowledged: Set<number>;
  /** Ce que répond le livreur quand le dialogue s'ouvre. */
  answer: 'understood' | 'later';
  readonly opened: unknown[];
}

let wire: Wire;

function gate(answer: Wire['answer'] = 'understood'): DriverNoticeGate {
  wire = { version: 1, acknowledged: new Set(), answer, opened: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DriverNoticeService,
        useValue: {
          mine: (): Promise<MyDriverNoticeView> =>
            Promise.resolve(
              myNoticeOf(wire.version, wire.acknowledged.has(wire.version) ? 'lu' : null),
            ),
          acknowledge: (): Promise<void> => Promise.resolve(),
        } satisfies Pick<DriverNoticeService, 'mine' | 'acknowledge'>,
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            const ref = new FoldPanelRef<boolean>(wire.opened.length, () => undefined);
            if (wire.answer === 'understood') {
              wire.acknowledged.add(wire.version);
            }
            ref.close(wire.answer === 'understood');
            return ref;
          },
        },
      },
    ],
  });
  return TestBed.inject(DriverNoticeGate);
}

describe('DriverNoticeGate — le texte avant le départ', () => {
  it('première tournée : le dialogue s’ouvre, « J’ai compris » laisse partir', async () => {
    const notice = gate();

    expect(await notice.clear()).toBe(true);
    expect(wire.opened).toEqual([
      { component: DriverNoticeDialog, data: { notice: myNoticeOf(1).notice } },
    ]);
  });

  it('seconde tournée : déjà lu, aucun dialogue', async () => {
    const notice = gate();
    await notice.clear();

    expect(await notice.clear()).toBe(true);
    expect(wire.opened).toHaveLength(1);
  });

  it('nouvelle version : le dialogue se rouvre, une fois', async () => {
    const notice = gate();
    await notice.clear();
    wire.version = 2;

    expect(await notice.clear()).toBe(true);
    expect(await notice.clear()).toBe(true);
    expect(wire.opened).toHaveLength(2);
  });

  it('« Plus tard » : ne laisse pas partir, et le redemande au prochain appui', async () => {
    const notice = gate('later');

    expect(await notice.clear()).toBe(false);
    expect(await notice.clear()).toBe(false);
    expect(wire.opened).toHaveLength(2);
  });
});
