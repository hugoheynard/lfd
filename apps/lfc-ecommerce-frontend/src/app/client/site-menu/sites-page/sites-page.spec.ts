import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ManageableSites } from '../manageable-sites';
import { SitesPage } from './sites-page';

const CHALET: CompanyView = { ...TOMMEUSES, id: 'cmp_chalet', enseigne: 'Chalet des Neiges' };

function render(sites: readonly CompanyView[], settled = true): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ManageableSites,
        useValue: { sites: signal(sites), settled: computed(() => settled) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SitesPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SitesPage', () => {
  it('liste chaque site avec un lien vers sa carte', () => {
    const host = render([CHALET]);
    const cards = host.querySelectorAll('[data-site]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('Chalet des Neiges');
    expect(host.querySelector('a[foldButton]')?.getAttribute('href')).toBe(
      '/mes-sites/cmp_chalet/carte',
    );
  });

  it('dit qu’aucun site n’est rattaché', () => {
    expect(render([]).querySelector('fold-empty-state')?.textContent).toContain('Aucun site');
  });

  it('attend le compte avant de juger', () => {
    expect(render([], false).querySelector('fold-loading')).not.toBeNull();
  });
});
