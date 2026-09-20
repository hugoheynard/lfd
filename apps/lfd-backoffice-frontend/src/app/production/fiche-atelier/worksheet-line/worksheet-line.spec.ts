import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopLine as WorkshopLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { WorksheetLine } from './worksheet-line';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **une ligne faite se voit** — fond, encre passée, nom barré viennent d'une
 *   classe sur l'hôte, et rien d'autre qu'un rendu ne peut vérifier qu'elle est
 *   bien posée ;
 * - **la colonne du contenant reste VIDE** quand rien n'est réglé : une fiche
 *   qui inventerait « 1 plaque » ferait sortir la mauvaise quantité ;
 * - **la case a un nom accessible.** Neuf cases sans nom sont indiscernables,
 *   et fold ne le dit qu'en `console.warn`, jamais en échec.
 */

function line(over: Partial<WorkshopLineView> = {}): WorkshopLineView {
  return {
    sku: 'BAG',
    productName: 'Baguette tradition',
    quantity: 160,
    containerLabel: '4 tourneuses',
    done: false,
    initials: null,
    doneAt: null,
    ...over,
  };
}

function render(value: WorkshopLineView): ComponentFixture<WorksheetLine> {
  const fixture = TestBed.createComponent(WorksheetLine);
  fixture.componentRef.setInput('line', value);
  fixture.detectChanges();
  return fixture;
}

describe('une ligne de fiche d’atelier', () => {
  it('montre la quantité et le nom, le contenant à côté', () => {
    const el: HTMLElement = render(line()).nativeElement;

    expect(el.querySelector('.wl-qty')?.textContent?.trim()).toBe('160');
    expect(el.querySelector('.wl-name')?.textContent?.trim()).toBe('Baguette tradition');
    expect(el.querySelector('.wl-container')?.textContent?.trim()).toBe('4 tourneuses');
  });

  it('laisse la colonne du contenant vide quand rien n’est réglé', () => {
    const el: HTMLElement = render(line({ containerLabel: null })).nativeElement;

    expect(el.querySelector('.wl-container')).toBeNull();
  });

  it('marque la ligne faite sur l’hôte, et montre les initiales', () => {
    const fixture = render(line({ done: true, initials: 'MJ' }));
    const el: HTMLElement = fixture.nativeElement;

    expect(el.classList.contains('is-done')).toBe(true);
    expect(el.querySelector('.wl-initials')?.textContent?.trim()).toBe('MJ');
  });

  it('laisse le trait au crayon quand la ligne est cochée sans signature', () => {
    const el: HTMLElement = render(line({ done: true, initials: null })).nativeElement;

    expect(el.querySelector('.wl-initials--blank')).not.toBeNull();
  });

  it('nomme la case par sa quantité et son produit', () => {
    const el: HTMLElement = render(line()).nativeElement;
    const box = el.querySelector('input[type="checkbox"]');

    expect(box?.getAttribute('aria-label')).toBe('160 Baguette tradition');
  });

  it('remonte l’état demandé, sans rien décider elle-même', () => {
    const fixture = render(line());
    const asked: boolean[] = [];
    fixture.componentInstance.toggled.subscribe((done) => asked.push(done));

    const box: HTMLInputElement | null =
      fixture.nativeElement.querySelector('input[type="checkbox"]');
    box?.click();
    fixture.detectChanges();

    expect(asked).toEqual([true]);
    // La ligne ne se coche pas toute seule : c'est le parent qui écrit, parce
    // que c'est lui qui saura le confier à la file.
    expect(fixture.nativeElement.classList.contains('is-done')).toBe(false);
  });
});
