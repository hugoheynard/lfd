import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CockpitBar } from './cockpit-bar';
import type { TodayHandovers } from './today-handovers';

async function render(handovers: TodayHandovers | null): Promise<string> {
  const fixture = TestBed.createComponent(CockpitBar);
  fixture.componentRef.setInput('portfolio', null);
  fixture.componentRef.setInput('tomorrow', null);
  fixture.componentRef.setInput('handovers', handovers);
  fixture.componentRef.setInput('kpis', []);
  fixture.componentRef.setInput('spark', null);
  await fixture.whenStable();
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/gu, ' ') ?? '';
}

describe('CockpitBar — les remises du jour', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('montre les retraits et le compteur coursier, et le reste à remettre des deux voies', async () => {
    const text = await render({
      pickup: { expected: 4, done: 1 },
      delivery: { expected: 3, done: 1 },
    });

    expect(text).toContain('4retrait');
    expect(text).toContain('3coursier');
    expect(text).toContain('5 encore à remettre');
  });

  it('dit « Tout est remis » quand les deux voies sont faites', async () => {
    const text = await render({
      pickup: { expected: 2, done: 2 },
      delivery: { expected: 1, done: 1 },
    });

    expect(text).toContain('Tout est remis');
  });

  it('dit que les remises sont indisponibles quand la lecture a échoué', async () => {
    const text = await render(null);

    expect(text).toContain('Remises du jour indisponibles');
  });
});
