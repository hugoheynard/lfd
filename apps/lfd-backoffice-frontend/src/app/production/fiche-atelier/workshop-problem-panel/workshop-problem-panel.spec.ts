import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ReportWorkshopProblem, WorkshopLine } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorksheetService } from '../../worksheet.service';
import { type ProblemPanelData, WorkshopProblemPanel } from './workshop-problem-panel';

/**
 * Le panneau rouge : le champ part VIDE (aucune quantité inventée), « Signaler »
 * envoie `produced` (et la raison si elle est dite) sous une clé d'intention ;
 * un refus reste dans le panneau, et le réessai rejoue la même clé.
 */

const DAY = '2026-11-18';

const LINE: WorkshopLine = {
  sku: 'CRO',
  productName: 'Croissant',
  quantity: 120,
  saleUnit: 'piece',
  containerLabel: null,
  done: true,
  initials: null,
  doneAt: null,
  produced: 120,
  remaining: 0,
  surplus: 0,
  batches: [],
  container: null,
  trackingLevel: 'always_green',
  ceiling: null,
  remainingUnderCeiling: 0,
  problem: null,
};

interface Sent {
  readonly date: string;
  readonly sku: string;
  readonly payload: ReportWorkshopProblem;
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
          reportProblem: (
            date: string,
            sku: string,
            payload: ReportWorkshopProblem,
            key: string,
          ): Promise<void> => {
            sent.push({ date, sku, payload, key });
            return failure === null ? Promise.resolve() : Promise.reject(failure);
          },
        },
      },
    ],
  });
});

function render(line: WorkshopLine = LINE): ComponentFixture<WorkshopProblemPanel> {
  const fixture = TestBed.createComponent(WorkshopProblemPanel);
  const data: ProblemPanelData = { date: DAY, line };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

const submit = (fixture: ComponentFixture<WorkshopProblemPanel>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-problem-submit]');

describe('le panneau rouge', () => {
  it('part vide : « Signaler » est désarmé tant qu’on n’a rien compté', () => {
    const fixture = render();

    expect(fixture.componentInstance['produced']()).toBeNull();
    expect(submit(fixture)?.disabled).toBe(true);
  });

  it('envoie `produced` sous une clé d’intention, puis se ferme sur un succès', async () => {
    const fixture = render();
    fixture.componentInstance['produced'].set(80);

    await fixture.componentInstance['submit']();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ date: DAY, sku: 'CRO', payload: { produced: 80 } });
    expect(sent[0]?.key).not.toBe('');
    expect(closed).toEqual([true]);
  });

  it('envoie la raison quand elle est dite, sans ses blancs', async () => {
    const fixture = render();
    fixture.componentInstance['produced'].set(0);
    fixture.componentInstance['reason'].set('  four en panne ');

    await fixture.componentInstance['submit']();

    expect(sent[0]?.payload).toEqual({ produced: 0, reason: 'four en panne' });
  });

  it('un refus reste dans le panneau, et le réessai rejoue la même clé', async () => {
    failure = new HttpErrorResponse({ status: 409, error: { message: 'Journée non arrêtée.' } });
    const fixture = render();
    fixture.componentInstance['produced'].set(80);

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-problem-refused]'),
    ).not.toBeNull();

    failure = null;
    await fixture.componentInstance['submit']();

    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(closed).toEqual([true]);
  });

  it('dit le rouge encore ouvert, qu’un nouveau remplacera', () => {
    const fixture = render({
      ...LINE,
      problem: {
        id: 'pb-1',
        version: 1,
        expected: 120,
        produced: 80,
        reason: null,
        reportedAt: `${DAY}T07:12:00.000Z`,
      },
    });

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-problem-open]')?.textContent,
    ).toContain('80 sur 120');
  });
});
