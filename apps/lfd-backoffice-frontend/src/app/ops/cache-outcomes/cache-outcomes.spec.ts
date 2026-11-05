import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { CacheReport } from '@lfd/ops-contract';

import { CacheOutcomes } from './cache-outcomes';

registerLocaleData(localeFr);

function render(caches: readonly CacheReport[] | undefined): ComponentFixture<CacheOutcomes> {
  TestBed.configureTestingModule({
    imports: [CacheOutcomes],
    providers: [{ provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(CacheOutcomes);
  fixture.componentRef.setInput('caches', caches);
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<CacheOutcomes>): string =>
  (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

describe('CacheOutcomes', () => {
  it('affiche la part servie par le serveur, la première issue bonne mise en avant', () => {
    const fixture = render([
      {
        cache: 'principal',
        total: 1000,
        windowMinutes: 30,
        outcomes: [
          { outcome: 'resolved-stamp', count: 76, share: 0.076 },
          { outcome: 'memory', count: 924, share: 0.924 },
        ],
      },
    ]);
    const content = text(fixture);
    expect(content).toContain('Principal (qui est le client)');
    expect(content).toContain('1000 lectures sur 30 minutes');
    expect(content).toContain('relu : estampille changée · 7,6');
    const badge = (fixture.nativeElement as HTMLElement).querySelectorAll('fold-badge');
    expect(badge.length).toBe(1);
    expect(badge[0]?.textContent).toContain('mémoire · 92,4');
  });

  it('affiche tel quel un cache ou une issue inconnus', () => {
    const fixture = render([
      {
        cache: 'mystery.cache',
        total: 4,
        windowMinutes: 30,
        outcomes: [{ outcome: 'weird', count: 4, share: 1 }],
      },
    ]);
    const content = text(fixture);
    expect(content).toContain('mystery.cache');
    expect(content).toContain('weird · 100');
  });

  it("montre l'état vide quand le relevé est absent ou vide", () => {
    for (const caches of [undefined, []]) {
      TestBed.resetTestingModule();
      const fixture = render(caches);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('fold-empty-state'),
      ).not.toBeNull();
      expect(text(fixture)).toContain('Aucune lecture de cache sur les 30 dernières minutes');
    }
  });
});
