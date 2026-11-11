import { TestBed } from '@angular/core/testing';
import type { AdminKbisView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { KbisCell } from './kbis-cell';

const TODAY = '2026-11-11';

function kbis(certified: boolean, issuedOn: string | null): AdminKbisView {
  return {
    fileName: 'kbis.pdf',
    uploadedAt: '2026-11-01T10:00:00.000Z',
    certified,
    certifiedAt: certified ? '2026-11-01T10:00:00.000Z' : null,
    certifiedBy: null,
    issuedOn,
  };
}

function render(value: AdminKbisView | null): HTMLElement {
  const fixture = TestBed.createComponent(KbisCell);
  fixture.componentRef.setInput('kbis', value);
  fixture.componentRef.setInput('today', TODAY);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('KbisCell', () => {
  it('Absent quand aucun extrait n’est déposé', () => {
    const host = render(null);
    expect(host.textContent).toContain('Absent');
    expect(host.getAttribute('data-tone')).toBeNull();
  });

  it('Déposé, sans ton d’âge, tant qu’il n’est pas certifié', () => {
    const host = render(kbis(false, null));
    expect(host.textContent).toContain('Déposé');
    expect(host.getAttribute('data-tone')).toBeNull();
  });

  it('Certifié récent : aucun fond, aucune mention', () => {
    const host = render(kbis(true, '2026-10-01'));
    expect(host.textContent).toContain('Certifié');
    expect(host.getAttribute('data-tone')).toBeNull();
    expect(host.querySelector('.age')).toBeNull();
  });

  it('Certifié de plus de 3 mois : ton warning, dit en clair', () => {
    const host = render(kbis(true, '2026-06-01'));
    expect(host.getAttribute('data-tone')).toBe('warning');
    expect(host.querySelector('.age')?.textContent).toContain('Extrait de plus de 3 mois');
    expect(host.getAttribute('title')).toBe('Extrait de plus de 3 mois');
  });

  it('Certifié sans date : ton warning, date inconnue', () => {
    const host = render(kbis(true, null));
    expect(host.getAttribute('data-tone')).toBe('warning');
    expect(host.textContent).toContain('Date de délivrance inconnue');
  });

  it('Certifié de plus d’un an : ton alert', () => {
    const host = render(kbis(true, '2025-10-01'));
    expect(host.getAttribute('data-tone')).toBe('alert');
    expect(host.textContent).toContain('Extrait de plus d’un an');
  });
});
