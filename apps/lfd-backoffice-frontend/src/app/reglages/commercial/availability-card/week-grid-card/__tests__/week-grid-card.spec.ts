import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AvailabilityService } from '../../../../../commercial/availability/availability.service';
import { NotifyService } from '../../../../../notify.service';
import { emptyDraft, type AvailabilityDraft } from '../../availability-draft';
import { WeekGridCard } from '../week-grid-card';

const MONDAY = 1;

describe('WeekGridCard — la croix de retrait', () => {
  it('retire la plage visée du brouillon', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AvailabilityService, useValue: {} },
        { provide: NotifyService, useValue: {} },
      ],
    });
    const base = emptyDraft({
      slotMinutes: 30,
      leadTimeHours: 24,
      horizonDays: 30,
      channels: ['phone'],
    });
    const week = base.week.map((ranges, day) =>
      day === MONDAY
        ? [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '14:00', endTime: '18:00' },
          ]
        : ranges,
    );
    const draft: AvailabilityDraft = { ...base, week };
    const fixture = TestBed.createComponent(WeekGridCard);
    fixture.componentRef.setInput('draft', draft);
    const emitted: AvailabilityDraft[] = [];
    fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Retirer la plage 09:00–12:00"]')
      ?.click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.week[MONDAY]).toEqual([{ startTime: '14:00', endTime: '18:00' }]);
  });
});
