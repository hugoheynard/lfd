import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FollowedAspectView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ParentBanner } from './parent-banner';

function render(follows: readonly FollowedAspectView[]): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ParentBanner);
  fixture.componentRef.setInput('parent', {
    id: 'p1',
    enseigne: 'Alpes Chalets',
    status: 'active',
  });
  fixture.componentRef.setInput('follows', follows);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ParentBanner', () => {
  it('nomme un site, et renvoie au principal pour le régler', () => {
    const host = render([{ aspect: 'billing', since: '2026-09-10T08:00:00.000Z' }]);
    expect(host.querySelector('[data-parent-banner]')?.textContent).toContain('Site de');
    expect(host.querySelector('[data-parent-settle]')?.getAttribute('href')).toBe(
      '/comptes-clients/p1/sous-comptes',
    );
  });

  it('nomme une entité rattachée quand la facturation ne suit pas', () => {
    expect(render([]).querySelector('[data-parent-banner]')?.textContent).toContain(
      'Entité rattachée à',
    );
  });

  /** Détacher s'est déplacé chez le principal le 2026-10-20 : plus de bouton ici. */
  it('ne porte plus le geste Détacher', () => {
    expect(render([]).querySelector('[data-detach]')).toBeNull();
  });
});
