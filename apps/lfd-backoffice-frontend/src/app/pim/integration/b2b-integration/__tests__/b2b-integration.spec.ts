import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2bIntegration } from '../b2b-integration';

/**
 * Ce que ce cas tient : la carte ne dit plus que ce qu'est le canal. La santé,
 * la parité et l'aperçu avant push sont partis en X2 (2026-10-17) ; la carte
 * n'appelle plus aucune route, et ne parle plus de push.
 */
describe('B2bIntegration', () => {
  it('décrit le canal sans promettre de push', async () => {
    TestBed.configureTestingModule({ imports: [B2bIntegration] });
    const fixture = TestBed.createComponent(B2bIntegration);
    await fixture.whenStable();
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Boutique B2B');
    expect(text).toContain('par ses faits');
    expect(text).not.toContain('push');
    expect(text).not.toContain('Publication');
  });
});
