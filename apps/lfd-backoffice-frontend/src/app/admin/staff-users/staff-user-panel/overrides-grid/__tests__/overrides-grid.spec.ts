import { TestBed } from '@angular/core/testing';
import { STAFF_RESOURCE_SCOPES, staffResourceSchema } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OverridesGrid } from '../overrides-grid';

function render(): HTMLElement {
  const fixture = TestBed.createComponent(OverridesGrid);
  fixture.componentRef.setInput('grants', { b2b_companies: 'read' });
  fixture.componentRef.setInput('overrides', []);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OverridesGrid — la portée de chaque droit', () => {
  /**
   * Hugo (2026-10-02) : une dérogation se pose sur un droit précis ; la phrase
   * dit ce qu'on ouvre ou ferme avant qu'on le fasse. Écrite, parce que le
   * panneau s'ouvre aussi là où rien ne se survole.
   */
  it('écrit sous chaque domaine sa portée en lecture et en écriture', () => {
    const host = render();
    const scopes = [...host.querySelectorAll('.row-scope')];

    expect(scopes).toHaveLength(staffResourceSchema.options.length);
    expect(
      scopes.some((scope) => scope.textContent?.includes(STAFF_RESOURCE_SCOPES.staff_access.write)),
    ).toBe(true);
  });

  it('garde le libellé du domaine distinct de sa portée', () => {
    const host = render();
    const labels = [...host.querySelectorAll('.row-label')].map((label) =>
      label.textContent?.trim(),
    );

    expect(labels).toContain('Gestes à la porte');
  });
});
