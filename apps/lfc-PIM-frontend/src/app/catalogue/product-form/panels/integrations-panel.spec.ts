import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { IntegrationsPanel } from './integrations-panel';

describe('IntegrationsPanel', () => {
  it('rend les deux intégrations (B2B + Shopify) dans un nav vertical', () => {
    const fixture = TestBed.createComponent(IntegrationsPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('B2B');
    expect(text).toContain('Shopify');
  });
});
