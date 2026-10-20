import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyFollowAspect, FollowedAspectView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FollowParentToggle } from './follow-parent-toggle';

function render(aspect: CompanyFollowAspect, follows: readonly FollowedAspectView[]): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(FollowParentToggle);
  fixture.componentRef.setInput('aspect', aspect);
  fixture.componentRef.setInput('parent', {
    id: 'p1',
    enseigne: 'Alpes Chalets',
    status: 'active',
  });
  fixture.componentRef.setInput('follows', follows);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FollowParentToggle (en lecture)', () => {
  it('dit depuis quand l’aspect est suivi', () => {
    const host = render('pricing', [{ aspect: 'pricing', since: '2026-09-10T08:00:00.000Z' }]);
    expect(host.querySelector('[data-follow-since]')?.textContent).toContain('10/09/2026');
  });

  it('dit qu’il ne suit pas, sans case à cocher', () => {
    const host = render('contacts', []);
    expect(host.querySelector('[data-follow-parent]')?.textContent).toContain('ne suit pas');
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('renvoie à la grille du principal pour régler', () => {
    const host = render('billing', []);
    expect(host.querySelector('[data-follow-settle]')?.getAttribute('href')).toBe(
      '/comptes-clients/p1/sous-comptes',
    );
  });
});
