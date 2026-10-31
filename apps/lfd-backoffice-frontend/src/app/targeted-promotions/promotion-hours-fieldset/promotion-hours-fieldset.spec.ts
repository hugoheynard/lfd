import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NO_HOURS, type DraftHours } from '../promotion-hours';
import { PromotionHoursFieldset } from './promotion-hours-fieldset';

const ON: DraftHours = {
  ...NO_HOURS,
  on: true,
  windows: [{ weekdays: ['thu'], start: '17:00', end: '19:00' }],
};

async function render(hours: DraftHours, disabled = false) {
  const fixture = TestBed.createComponent(PromotionHoursFieldset);
  fixture.componentRef.setInput('hours', hours);
  fixture.componentRef.setInput('disabled', disabled);
  const emitted: DraftHours[] = [];
  fixture.componentInstance.hoursChange.subscribe((next) => emitted.push(next));
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, emitted };
}

const box = (root: HTMLElement, selector: string) =>
  root.querySelector<HTMLInputElement>(`${selector} input[type=checkbox]`);

describe('PromotionHoursFieldset', () => {
  it('décochée, ne montre que l’option', async () => {
    const { root } = await render(NO_HOURS);
    expect(root.querySelector('[data-hours-window]')).toBeNull();
  });

  it('un jour coché se range dans l’ordre de la semaine', async () => {
    const { root, emitted } = await render(ON);
    box(root, '[data-day=mon]')?.click();
    expect(emitted.at(-1)?.windows[0]?.weekdays).toEqual(['mon', 'thu']);
  });

  it('« Jusqu’à minuit » pose 24:00 et cache l’heure de fin', async () => {
    const { root, emitted } = await render(ON);
    box(root, '[data-midnight]')?.click();
    expect(emitted.at(-1)?.windows[0]?.end).toBe('24:00');
    const { root: atMidnight } = await render({
      ...ON,
      windows: [{ weekdays: ['thu'], start: '20:00', end: '24:00' }],
    });
    expect(atMidnight.querySelector('[data-end]')).toBeNull();
  });

  it('désactivée, ne publie rien', async () => {
    const { root, emitted } = await render(ON, true);
    box(root, '[data-day=mon]')?.click();
    expect(emitted).toEqual([]);
  });
});
