import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { shiftMonth, SupervisionCalendar } from './supervision-calendar';

@Component({
  imports: [SupervisionCalendar],
  template: `
    <app-supervision-calendar
      [selected]="selected()"
      [today]="'2026-09-25'"
      [custom]="custom()"
      (pick)="picked.push($event)"
    />
  `,
})
class Host {
  readonly selected = signal<string | null>('2026-09-25');
  readonly custom = signal(false);
  readonly picked: (string | null)[] = [];
}

async function mount() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('shiftMonth', () => {
  it('passe au 1er du mois voisin, années comprises', () => {
    expect(shiftMonth('2026-09-25', 1)).toBe('2026-10-01');
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01');
  });
});

describe('SupervisionCalendar', () => {
  it('un bouton d’icône seul pour hier, aujourd’hui, demain', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('fold-button-icon[data-calendar]')).not.toBeNull();
    expect(element.querySelector('button[data-calendar]')).toBeNull();
  });

  /** Supervision v2, A1 : hors ±1, le bouton dit la date en toutes lettres. */
  it('dit une date lointaine en toutes lettres', async () => {
    const fixture = await mount();
    fixture.componentInstance.selected.set('2026-09-16');
    fixture.componentInstance.custom.set(true);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button[data-calendar]')?.textContent,
    ).toContain('mercredi 16 septembre');
  });

  it('« Aujourd’hui » rend la main au jour du serveur', async () => {
    const fixture = await mount();
    const today = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.calendar-foot button',
      ),
    ].find((button) => button.textContent?.includes('Aujourd’hui'));

    today?.click();

    expect(fixture.componentInstance.picked).toEqual([null]);
  });
});
