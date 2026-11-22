import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DeletedAccountBanner } from './deleted-account-banner';

function render(archivedByName: string | null, reason: string | null) {
  const fixture = TestBed.createComponent(DeletedAccountBanner);
  fixture.componentRef.setInput('archivedAt', '2026-11-20T10:00:00.000Z');
  fixture.componentRef.setInput('archivedByName', archivedByName);
  fixture.componentRef.setInput('reason', reason);
  const restores: number[] = [];
  fixture.componentInstance.unarchive.subscribe(() => restores.push(1));
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, restores };
}

describe('bandeau du compte supprimé', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit quand, par qui et pourquoi', () => {
    const { host } = render('Camille Rousseau', 'Doublon');
    const text = host.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Compte supprimé le 20/11/2026, par Camille Rousseau, motif : Doublon.');
  });

  it('n’invente pas d’auteur quand il manque', () => {
    const { host } = render(null, 'Doublon');
    expect(host.textContent).not.toContain('par');
  });

  it('« Rétablir le compte » demande le rétablissement', () => {
    const { host, restores } = render('Camille Rousseau', 'Doublon');
    (host.querySelector('button') as HTMLButtonElement).click();
    expect(restores).toEqual([1]);
  });
});
