import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { marketingConsentCopy } from '../../copy/screens/marketing-consent.copy';
import { MarketingConsentBox, PRIVACY_PAGE } from './marketing-consent-box';

/**
 * La case dit le texte de la VERSION qu'on enverra, et renvoie à la mention.
 */
describe('MarketingConsentBox', () => {
  function mount(box: 'society' | 'partners' = 'society') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [MarketingConsentBox] });
    const fixture = TestBed.createComponent(MarketingConsentBox);
    fixture.componentRef.setInput('box', box);
    fixture.detectChanges();
    return fixture;
  }

  it('montre le texte de `society.v1`, non coché, avec le lien vers la mention', () => {
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain(marketingConsentCopy('fr').societyV1);
    expect(el.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe(PRIVACY_PAGE);
    expect(link?.getAttribute('aria-label')).toContain('nouvel onglet');
  });

  it('la case partenaires dit `partners.v1`', () => {
    const el = mount('partners').nativeElement as HTMLElement;

    expect(el.textContent).toContain(marketingConsentCopy('fr').partnersV1);
  });

  it('cocher remonte au parent', () => {
    const fixture = mount();
    const seen: boolean[] = [];
    fixture.componentInstance.checkedChange.subscribe((value) => seen.push(value));
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    );
    input?.click();

    expect(seen).toEqual([true]);
  });
});
