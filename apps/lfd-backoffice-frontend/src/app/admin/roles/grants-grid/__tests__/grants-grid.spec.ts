import { TestBed } from '@angular/core/testing';
import { STAFF_RESOURCE_SCOPES, staffResourceSchema, type RoleGrant } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { GrantsGrid } from '../grants-grid';

function render(grants: readonly RoleGrant[] = []): HTMLElement {
  const fixture = TestBed.createComponent(GrantsGrid);
  fixture.componentRef.setInput('grants', grants);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function rowOf(host: HTMLElement, label: string): HTMLTableRowElement {
  const row = [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].find(
    (candidate) => candidate.querySelector('.row-label')?.textContent?.trim() === label,
  );
  if (row === undefined) {
    throw new Error(`ligne introuvable : ${label}`);
  }
  return row;
}

describe('GrantsGrid — la portée de chaque droit', () => {
  /**
   * Hugo (2026-10-02) : « pour chaque droit, une phrase expliquant le scope ».
   * Écrite sous le libellé, pas dans un `title` : on règle un niveau en
   * sachant ce qu'il ouvre, sans survoler.
   */
  it('écrit sous chaque domaine ce que la lecture ouvre et ce que l’écriture ajoute', () => {
    const host = render();
    const scopes = [...host.querySelectorAll('.row-scope')];

    expect(scopes).toHaveLength(staffResourceSchema.options.length);

    const row = rowOf(host, 'Conduire sa tournée');
    const text = row.querySelector('.row-scope')?.textContent ?? '';
    expect(text).toContain(STAFF_RESOURCE_SCOPES.delivery_driving.read);
    expect(text).toContain(STAFF_RESOURCE_SCOPES.delivery_driving.write);
  });

  it('n’emploie aucun attribut title pour porter la portée', () => {
    const host = render();

    expect(host.querySelector('tbody th[title]')).toBeNull();
  });

  it('garde la portée dans l’en-tête de ligne, que le lecteur d’écran annonce avec le select', () => {
    const host = render([{ resource: 'staff_access', action: 'read' }]);
    const header = rowOf(host, 'Équipe et accès').querySelector('th[scope="row"]');

    expect(header?.textContent).toContain(STAFF_RESOURCE_SCOPES.staff_access.write);
  });
});
