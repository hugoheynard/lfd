import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LineStep } from './line-step';

const LINE: WorkshopLine = {
  sku: 'SAN',
  productName: 'Sandwich jambon',
  quantity: 10,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 0,
  remaining: 10,
  surplus: 0,
  batches: [],
  container: null,
  role: 'step',
  stepsPending: ['ws_b'],
};

function render(line: WorkshopLine = LINE): ComponentFixture<LineStep> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(LineStep);
  fixture.componentRef.setInput('line', line);
  fixture.componentRef.setInput('workstationId', 'ws_b');
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<LineStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('une ligne d’étape', () => {
  it('lit toute la quantité sans la compter, et offre « Étape faite » et le rouge', () => {
    const fixture = render();
    const root = host(fixture);
    const gestures: string[] = [];
    fixture.componentInstance.done.subscribe(() => gestures.push('done'));
    fixture.componentInstance.red.subscribe(() => gestures.push('red'));

    expect(root.querySelector('[data-line-figures]')?.textContent).toContain('10 à préparer');
    expect(root.querySelector('[data-line-step-badge]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-step-done-button]')?.click();
    root.querySelector<HTMLButtonElement>('[data-step-red-button]')?.click();

    expect(gestures).toEqual(['done', 'red']);
    expect(root.querySelector('[data-step-undo-button]')).toBeNull();
  });

  it('faite (ce poste n’attend plus) : un badge et « Décocher », sans autre geste', () => {
    const fixture = render({ ...LINE, stepsPending: ['ws_other'] });
    const root = host(fixture);
    let undone = 0;
    fixture.componentInstance.undone.subscribe(() => (undone += 1));

    expect(root.classList.contains('is-done')).toBe(true);
    expect(root.querySelector('[data-step-done-badge]')).not.toBeNull();
    expect(root.querySelector('[data-step-done-button]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-step-undo-button]')?.click();
    expect(undone).toBe(1);
  });

  it('en rouge (servi par `stepState`) : le rouge et sa raison, « Décocher », sans « Étape faite »', () => {
    const fixture = render({ ...LINE, stepState: 'red', stepRedReason: 'Four en panne' });
    const root = host(fixture);
    let undone = 0;
    fixture.componentInstance.undone.subscribe(() => (undone += 1));

    expect(root.classList.contains('is-red')).toBe(true);
    expect(root.querySelector('[data-step-red-badge]')?.textContent).toContain(
      'Rouge — Four en panne',
    );
    expect(root.querySelector('[data-step-done-button]')).toBeNull();
    expect(root.querySelector('[data-step-red-button]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-step-undo-button]')?.click();
    expect(undone).toBe(1);
  });

  it('`stepState` l’emporte sur `stepsPending` : faite, malgré un poste encore en attente', () => {
    const root = host(render({ ...LINE, stepState: 'done', stepRedReason: null }));

    expect(root.querySelector('[data-step-done-badge]')).not.toBeNull();
    expect(root.querySelector('[data-step-undo-button]')).not.toBeNull();
  });

  it('en attente (servi par `stepState`) : « Étape faite » et « Rouge », sans « Décocher »', () => {
    const root = host(
      render({ ...LINE, stepsPending: [], stepState: 'pending', stepRedReason: null }),
    );

    expect(root.querySelector('[data-step-done-button]')).not.toBeNull();
    expect(root.querySelector('[data-step-red-button]')).not.toBeNull();
    expect(root.querySelector('[data-step-undo-button]')).toBeNull();
  });

  it('désarme ses gestes pendant un envoi', () => {
    const fixture = render();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(
      host(fixture).querySelector<HTMLButtonElement>('[data-step-done-button]')?.disabled,
    ).toBe(true);
  });
});
