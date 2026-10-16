import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EMPTY_SCHEDULE } from '../operation-schedule';
import { ScheduleForm } from './schedule-form';

describe('ScheduleForm', () => {
  it('un champ modifié réécrit le brouillon sans toucher aux autres', () => {
    const fixture = TestBed.createComponent(ScheduleForm);
    fixture.componentRef.setInput('draft', { ...EMPTY_SCHEDULE, pickupFrom: '2026-12-23' });
    fixture.detectChanges();
    fixture.componentInstance['set']('announceTime', '08:00');
    expect(fixture.componentInstance.draft()).toEqual({
      ...EMPTY_SCHEDULE,
      pickupFrom: '2026-12-23',
      announceTime: '08:00',
    });
  });

  it('pose les cinq dates : trois instants (jour + heure) et deux jours', () => {
    const fixture = TestBed.createComponent(ScheduleForm);
    fixture.componentRef.setInput('draft', EMPTY_SCHEDULE);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('fold-date')).toHaveLength(5);
    expect(root.querySelectorAll('fold-time')).toHaveLength(3);
  });
});
