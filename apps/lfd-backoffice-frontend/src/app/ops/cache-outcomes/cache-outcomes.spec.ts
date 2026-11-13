import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { CacheCallReport, CacheReport } from '@lfd/ops-contract';

import { CacheOutcomes } from './cache-outcomes';

registerLocaleData(localeFr);

function render(
  caches: readonly CacheReport[] | undefined,
  calls?: readonly CacheCallReport[],
): ComponentFixture<CacheOutcomes> {
  TestBed.configureTestingModule({
    imports: [CacheOutcomes],
    providers: [{ provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(CacheOutcomes);
  fixture.componentRef.setInput('caches', caches);
  if (calls) fixture.componentRef.setInput('calls', calls);
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

  /**
   * Hugo, 2026-11-05 : « c'est pas clair la lecture des datas ». La carte dit
   * d'abord la part servie sans aller en base, puis ce que veut dire chaque issue.
   */
  it('dit en tête la part servie sans aller en base, et explique chaque issue', () => {
    const fixture = render([
      {
        cache: 'principal',
        total: 26,
        windowMinutes: 30,
        outcomes: [
          { outcome: 'memory', count: 24, share: 0.923 },
          { outcome: 'joined', count: 1, share: 0.038 },
          { outcome: 'resolved-absent', count: 1, share: 0.038 },
        ],
      },
    ]);
    const content = text(fixture);
    expect(content).toContain('92 % servis sans aller en base');
    expect(content).toContain('trouvé en mémoire, sans aller en base');
    expect(content).toContain('premier appel après un redémarrage');
  });

  it("affiche « 0 % » quand un cache n'a rien servi sans aller en base", () => {
    const fixture = render([
      {
        cache: 'shelf.read',
        total: 3,
        windowMinutes: 30,
        outcomes: [{ outcome: 'miss', count: 3, share: 1 }],
      },
    ]);
    expect(text(fixture)).toContain('0 % servis sans aller en base');
  });

  it('affiche la mesure des appels aux objets, par magasin et par opération', () => {
    const fixture = render(
      [],
      [
        {
          store: 'shelf_cache',
          operation: 'read',
          calls: 120,
          late: 4,
          p50Ms: 12,
          p95Ms: 85,
          lateFinishP95Ms: 140,
          windowMinutes: 30,
        },
        {
          store: 'shelf_cache',
          operation: 'store',
          calls: 10,
          late: 0,
          p50Ms: 20,
          p95Ms: 40,
          lateFinishP95Ms: null,
          windowMinutes: 30,
        },
      ],
    );
    const content = text(fixture);
    expect(content).toContain('Appels aux objets partagés');
    expect(content).toContain(
      'Objet des rayons — lecture : 120 appels — médiane 12 ms, 95 % sous 85 ms — 4 abandonnés (délai dépassé)',
    );
    expect(content).toContain('les abandonnés finissaient en 140 ms');
    expect(content).toContain(
      'Objet des rayons — rangement : 10 appels — médiane 20 ms, 95 % sous 40 ms — 0 abandonnés',
    );
    expect(content.match(/finissaient en/g)?.length).toBe(1);
  });

  it("n'affiche aucune mesure d'appel quand l'API ne l'envoie pas", () => {
    const fixture = render([
      {
        cache: 'principal',
        total: 1,
        windowMinutes: 30,
        outcomes: [{ outcome: 'memory', count: 1, share: 1 }],
      },
    ]);
    expect(text(fixture)).not.toContain('Appels aux objets');
  });
});
