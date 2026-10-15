import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { type RoleGrant } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toolGroups } from '../../resource-tools';
import { GrantsGrid, SEARCH_DELAY_MS } from '../grants-grid';

/**
 * Hugo (2026-10-15) : une recherche dans l'édition d'un rôle, qui surligne le
 * terme et les outils associés, et ne change RIEN aux droits.
 */
describe('GrantsGrid — la recherche', () => {
  let fixture: ComponentFixture<GrantsGrid>;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(grants: readonly RoleGrant[] = []): HTMLElement {
    fixture = TestBed.createComponent(GrantsGrid);
    fixture.componentRef.setInput('grants', grants);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function type(host: HTMLElement, value: string): void {
    const input = host.querySelector<HTMLInputElement>('fold-search input');
    if (input === null) {
      throw new Error('champ de recherche introuvable');
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function settle(): void {
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    fixture.detectChanges();
  }

  const rowLabels = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('.row-label')].map((node) => node.textContent?.trim() ?? '');
  const groupLabels = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('.grid-group-label')].map((node) => node.textContent?.trim() ?? '');
  const total = toolGroups().reduce((sum, group) => sum + group.resources.length, 0);

  it('ne filtre qu’après la pause de frappe', () => {
    const host = render();
    type(host, 'legal');
    expect(rowLabels(host)).toHaveLength(total);

    settle();
    expect(rowLabels(host)).toContain('Légal');
    expect(rowLabels(host).length).toBeLessThan(total);
  });

  it('surligne le terme dans le libellé, accents compris, et dit l’outil associé', () => {
    const host = render();
    type(host, 'legal');
    settle();

    const marks = [...host.querySelectorAll('.row-label mark.hit')].map((m) => m.textContent);
    expect(marks).toContain('Légal');

    const lfc = [...host.querySelectorAll('tr.grid-group')].find((row) =>
      row.textContent?.includes('Vente LFC'),
    );
    expect(lfc?.classList.contains('grid-group--associated')).toBe(true);
    expect(lfc?.querySelector('.grid-group-label mark')).toBeNull();
    expect(lfc?.querySelector('fold-badge')?.textContent).toContain('Droit associé');
  });

  it('garde un outil entier quand son nom correspond, et y surligne le nom', () => {
    const host = render();
    type(host, 'fournil');
    settle();

    const production = toolGroups().find((group) => group.tool === 'production');
    expect(groupLabels(host)).toContain('Fournil');
    expect(host.querySelector('.grid-group-label mark.hit')?.textContent).toBe('Fournil');
    const fournil = [...host.querySelectorAll('tr.grid-group')].find((row) =>
      row.textContent?.includes('Fournil'),
    );
    expect(fournil?.classList.contains('grid-group--associated')).toBe(false);
    for (const entry of production?.resources ?? []) {
      expect(rowLabels(host)).toContain(entry.label);
    }
  });

  it('montre l’état vide fold en citant le terme', () => {
    const host = render();
    type(host, 'zzqx');
    settle();

    const empty = host.querySelector('fold-empty-state');
    expect(empty?.textContent).toContain('« zzqx »');
    expect(host.querySelector('table')).toBeNull();
  });

  it('réaffiche tout dès l’effacement, sans attendre', () => {
    const host = render();
    type(host, 'legal');
    settle();
    type(host, '');

    expect(rowLabels(host)).toHaveLength(total);
    expect(host.querySelector('mark')).toBeNull();
  });

  it('ne touche à aucun droit, masqué ou non, et les garde après effacement', () => {
    const grants: readonly RoleGrant[] = [
      { resource: 'staff_access', action: 'read' },
      { resource: 'lfc_legal', action: 'write' },
    ];
    const host = render(grants);
    type(host, 'equipe');
    settle();
    expect(rowLabels(host)).not.toContain('Légal');
    expect(fixture.componentInstance.grants()).toEqual(grants);

    type(host, '');
    expect(fixture.componentInstance.grants()).toEqual(grants);
    const legal = [...host.querySelectorAll('tbody tr')].find(
      (row) => row.querySelector('.row-label')?.textContent?.trim() === 'Légal',
    );
    expect(legal?.querySelector('select')?.value).toBe('write');
  });
});
