import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopDrift } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DriftBanner } from './drift-banner';

/**
 * Ce que ces cas tiennent : **le bandeau ne résume jamais le cas dangereux**.
 *
 * Une ligne déjà cochée dont la quantité change veut dire que quelqu'un a
 * déclaré avoir sorti 30 pièces d'un article qui en demande 42, et que personne
 * ne le saura au colisage. Un compteur ne dit pas laquelle — c'est la seule
 * raison pour laquelle ce bandeau nomme ses lignes.
 */

const DRIFT: WorkshopDrift = {
  orders: 14,
  addedUnits: 18,
  lines: [
    { sku: 'SEI', productName: 'Pain de seigle', from: 30, to: 42, done: true },
    { sku: 'BAG', productName: 'Baguette tradition', from: 160, to: 166, done: false },
  ],
};

function render(drift: WorkshopDrift, compact = false): ComponentFixture<DriftBanner> {
  const fixture = TestBed.createComponent(DriftBanner);
  fixture.componentRef.setInput('drift', drift);
  fixture.componentRef.setInput('generatedLabel', '4 h 05');
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  return fixture;
}

describe('le bandeau de version périmée', () => {
  it('donne un chiffre et une action, jamais « attention »', () => {
    const el: HTMLElement = render(DRIFT).nativeElement;

    expect(el.textContent).toContain('+18');
    expect(el.textContent).toContain('4 h 05');
    expect(el.textContent).toContain('Retirer la fiche');
    expect(el.textContent?.toLowerCase()).not.toContain('attention');
  });

  it('🔴 écrit en clair qu’une ligne qui change est déjà cochée', () => {
    const el: HTMLElement = render(DRIFT).nativeElement;

    expect(el.textContent).toContain('déjà cochée');
  });

  it('se tait sur le cas dangereux quand il n’y en a pas', () => {
    const el: HTMLElement = render({
      ...DRIFT,
      lines: [{ sku: 'BAG', productName: 'Baguette', from: 160, to: 166, done: false }],
    }).nativeElement;

    expect(el.textContent).not.toContain('déjà cochée');
  });

  it('ne nomme les lignes qu’une fois l’écart déplié', () => {
    const fixture = render(DRIFT);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.db-lines')).toBeNull();

    el.querySelectorAll('button')[1]?.click();
    fixture.detectChanges();

    expect(el.querySelector('.db-lines')?.textContent).toContain('Pain de seigle');
    expect(el.querySelector('.db-lines')?.textContent).toContain('42');
  });

  it('condense sous le pouce : un chiffre, une action, et le cas dangereux quand même', () => {
    const el: HTMLElement = render(DRIFT, true).nativeElement;

    expect(el.textContent).toContain('+18');
    expect(el.textContent).toContain('Mettre à jour');
    expect(el.textContent).toContain('déjà cochée');
    // Pas de « Voir l'écart » : il n'y a pas la place, et le chiffre suffit à
    // décider de mettre à jour.
    expect(el.querySelectorAll('button')).toHaveLength(1);
  });

  it('remonte le retirage sans le faire lui-même', () => {
    const fixture = render(DRIFT);
    let asked = 0;
    fixture.componentInstance.retake.subscribe(() => (asked += 1));

    fixture.nativeElement.querySelector('button')?.click();

    expect(asked).toBe(1);
  });
});
