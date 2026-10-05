import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { SubAccountBadge } from './sub-account-badge';

describe('SubAccountBadge', () => {
  it('nomme le principal et mène à SA fiche, sans laisser remonter le clic', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'comptes-clients/:id', children: [] }])],
    });
    const fixture = TestBed.createComponent(SubAccountBadge);
    fixture.componentRef.setInput('parent', { id: 'parent_1', enseigne: 'Chalets du Lac' });
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.textContent).toContain('Sous-compte de Chalets du Lac');
    expect(link?.getAttribute('href')).toBe('/comptes-clients/parent_1');

    let bubbled = false;
    (fixture.nativeElement as HTMLElement).addEventListener('click', () => (bubbled = true));
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(bubbled).toBe(false);
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/comptes-clients/parent_1');
  });
});
