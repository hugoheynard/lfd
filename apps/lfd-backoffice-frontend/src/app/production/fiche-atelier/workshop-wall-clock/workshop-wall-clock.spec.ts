import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { WorkshopClock } from '../workshop-clock';
import { WorkshopWallClock } from './workshop-wall-clock';

/** L'horloge du bandeau de la fiche (maquette v3, 2026-10-28). */
describe('WorkshopWallClock', () => {
  it('écrit « 7:56 » en gros et les secondes à part', () => {
    const seconds = signal(7 * 3600 + 56 * 60 + 9);
    TestBed.configureTestingModule({
      imports: [WorkshopWallClock],
      providers: [{ provide: WorkshopClock, useValue: { seconds } }],
    });
    const fixture = TestBed.createComponent(WorkshopWallClock);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.wc-main')?.textContent).toBe('7:56');
    expect(root.querySelector('.wc-seconds')?.textContent).toBe('09');

    seconds.set(10 * 3600 + 5 * 60 + 59);
    fixture.detectChanges();
    expect(root.querySelector('.wc-main')?.textContent).toBe('10:05');
  });
});
