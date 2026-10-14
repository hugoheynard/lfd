import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ProductionPlanReopening } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { ProductionService } from '../../production.service';
import { ReopenDay } from './reopen-day';

/**
 * **Rouvrir la journée** (2026-10-14) : la confirmation dit l'effet, le
 * succès dit un chiffre, et le refus du serveur s'affiche tel quel.
 */

const DATE = '2026-10-15';
const REFUSAL =
  'La journée du 2026-10-15 ne se rouvre pas : une fournée est déjà déclarée au fournil.';

interface Harness {
  readonly fixture: ComponentFixture<ReopenDay>;
  readonly reopenDay: ReturnType<typeof vi.fn>;
  readonly success: ReturnType<typeof vi.fn>;
  readonly emitted: string[];
}

function render(answer: () => Promise<ProductionPlanReopening>): Harness {
  const reopenDay = vi.fn(answer);
  const success = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductionService, useValue: { reopenDay } },
      { provide: NotifyService, useValue: { success } },
    ],
  });
  const fixture = TestBed.createComponent(ReopenDay);
  fixture.componentRef.setInput('date', DATE);
  fixture.componentRef.setInput('label', 'jeudi 15 octobre');
  const emitted: string[] = [];
  fixture.componentInstance.reopened.subscribe(() => emitted.push('reopened'));
  fixture.detectChanges();
  return { fixture, reopenDay, success, emitted };
}

function text(fixture: ComponentFixture<ReopenDay>): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
}

describe('rouvrir la journée', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('nomme sa journée, et la confirmation dit ce que la réouverture change', () => {
    const { fixture } = render(async () => ({ date: DATE, released: 0, reopenedAt: '' }));
    expect(text(fixture)).toContain('Rouvrir la journée du jeudi 15 octobre');

    fixture.componentInstance['ask']();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Les clients pourront de nouveau commander pour ce jour');
    expect(text(fixture)).toContain('refait au prochain arrêt');
  });

  it('rouvre, dit combien de commandes sortent du plan, et prévient le parent', async () => {
    const { fixture, reopenDay, success, emitted } = render(async () => ({
      date: DATE,
      released: 3,
      reopenedAt: '',
    }));

    await fixture.componentInstance['reopen']();

    expect(reopenDay).toHaveBeenCalledWith(DATE);
    expect(success).toHaveBeenCalledWith(
      'Journée du jeudi 15 octobre rouverte : 3 commandes retirées du plan.',
    );
    expect(emitted).toEqual(['reopened']);
  });

  it('affiche le refus du serveur tel quel, et ne prévient personne', async () => {
    const { fixture, emitted } = render(async () => {
      throw new HttpErrorResponse({ status: 409, error: { message: REFUSAL } });
    });

    await fixture.componentInstance['reopen']();
    fixture.detectChanges();

    expect(text(fixture)).toContain(REFUSAL);
    expect(emitted).toEqual([]);
  });
});
