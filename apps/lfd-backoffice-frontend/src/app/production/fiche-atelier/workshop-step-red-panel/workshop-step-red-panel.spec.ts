import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { MarkWorkshopStepRed, WorkshopLine } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorksheetService } from '../../worksheet.service';
import { type StepRedPanelData, WorkshopStepRedPanel } from './workshop-step-red-panel';

/**
 * Le rouge d'une étape : aucune quantité, une raison si on veut, envoyée sous
 * une clé d'intention ; un refus reste dans le panneau, le réessai rejoue la
 * même clé.
 */

const DAY = '2026-11-25';

const LINE: WorkshopLine = {
  sku: 'SAN',
  productName: 'Sandwich jambon',
  quantity: 10,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 0,
  remaining: 10,
  surplus: 0,
  batches: [],
  container: null,
  role: 'step',
  stepsPending: ['ws_b'],
};

interface Sent {
  readonly sku: string;
  readonly workstationId: string;
  readonly payload: MarkWorkshopStepRed;
  readonly key: string;
}

let sent: Sent[];
let closed: (boolean | undefined)[];
let failure: unknown;

beforeEach(() => {
  sent = [];
  closed = [];
  failure = null;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (value?: boolean): void => void closed.push(value) },
      },
      {
        provide: WorksheetService,
        useValue: {
          markStepRed: (
            _date: string,
            sku: string,
            workstationId: string,
            payload: MarkWorkshopStepRed,
            key: string,
          ): Promise<void> => {
            sent.push({ sku, workstationId, payload, key });
            return failure === null ? Promise.resolve() : Promise.reject(failure);
          },
        },
      },
    ],
  });
});

function render(): ComponentFixture<WorkshopStepRedPanel> {
  const fixture = TestBed.createComponent(WorkshopStepRedPanel);
  const data: StepRedPanelData = { date: DAY, line: LINE, workstationId: 'ws_b' };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('le rouge d’une étape', () => {
  it('part sans raison si on n’en donne pas, sous une clé d’intention, et ferme', async () => {
    const fixture = render();

    await fixture.componentInstance['submit']();

    expect(sent).toEqual([
      { sku: 'SAN', workstationId: 'ws_b', payload: {}, key: expect.any(String) },
    ]);
    expect(closed).toEqual([true]);
  });

  it('envoie la raison sans ses blancs', async () => {
    const fixture = render();
    fixture.componentInstance['reason'].set('  plus de farine ');

    await fixture.componentInstance['submit']();

    expect(sent[0]?.payload).toEqual({ reason: 'plus de farine' });
  });

  it('un refus reste dans le panneau, et le réessai rejoue la même clé', async () => {
    failure = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce poste finit la ligne.' },
    });
    const fixture = render();

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-step-red-refused]'),
    ).not.toBeNull();

    failure = null;
    await fixture.componentInstance['submit']();

    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(closed).toEqual([true]);
  });
});
