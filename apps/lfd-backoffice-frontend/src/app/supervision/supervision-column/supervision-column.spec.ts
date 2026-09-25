import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { ColumnState } from '../column-state';
import { SupervisionColumn } from './supervision-column';

@Component({
  imports: [SupervisionColumn],
  template: `
    <app-supervision-column
      heading="1 · Préparation"
      unit="l'unité est le produit"
      description="Ce qu'on y lit."
      loadingMessage="Lecture…"
      errorTitle="Illisible"
      [state]="state()"
      (retry)="retried = retried + 1"
    >
      <p class="content">contenu</p>
    </app-supervision-column>
  `,
})
class Host {
  readonly state = signal<ColumnState<unknown>>({ status: 'loading' });
  retried = 0;
}

async function mount(state: ColumnState<unknown>) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.state.set(state);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

/** `min-height: 0`, que jsdom rend tel qu'écrit. */
const ZERO = /^0(px)?$/u;

describe('SupervisionColumn', () => {
  it('dit son unité, et charge par fold', async () => {
    const fixture = await mount({ status: 'loading' });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain("l'unité est le produit");
    expect(element.querySelector('fold-loading')).not.toBeNull();
    expect(element.querySelector('.content')).toBeNull();
  });

  it('dit son échec et propose de réessayer', async () => {
    const fixture = await mount({ status: 'error' });
    const element: HTMLElement = fixture.nativeElement;

    element.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('garde le contenu quand une relecture échoue, et le dit', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: true });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.content')).not.toBeNull();
    expect(element.querySelector('fold-callout')?.textContent).toContain('relecture a échoué');
  });

  /**
   * Chaque colonne a SON défilement : l'en-tête reste, seul le corps défile, et
   * la chaîne flex ne se laisse pas pousser par son contenu (Hugo, 2026-09-25).
   */
  it('fait défiler le corps seul, sous un en-tête fixe', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    const element: HTMLElement = fixture.nativeElement;
    const style = (selector: string): CSSStyleDeclaration =>
      getComputedStyle(element.querySelector(selector) ?? element);

    expect(style('.body').overflowY).toBe('auto');
    expect(style('.body').minHeight).toMatch(ZERO);
    expect(style('.column').minHeight).toMatch(ZERO);
    expect(
      getComputedStyle(element.querySelector('app-supervision-column') ?? element).minHeight,
    ).toMatch(ZERO);
    expect(style('.head').overflowY).not.toBe('auto');
  });
});
