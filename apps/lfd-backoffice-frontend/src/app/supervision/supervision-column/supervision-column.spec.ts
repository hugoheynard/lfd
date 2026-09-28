import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { ColumnState } from '../column-state';
import type { SupervisionFocus } from '../supervision-search';
import type { ColumnBlocker } from '../supervision-tabs';
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
      countUnit="lignes ouvertes"
      [state]="state()"
      [count]="5"
      [subtitle]="'4 rayons · 2 terminés'"
      [hits]="hits()"
      [blockers]="blockers()"
      [groupBlockers]="grouped()"
      [focus]="focus()"
      [narrow]="narrow()"
      (focusToggle)="toggled.push($event)"
      (retry)="retried = retried + 1"
    >
      <span columnBand class="band-content">bande</span>
      <p class="content">contenu</p>
    </app-supervision-column>
  `,
})
class Host {
  readonly state = signal<ColumnState<unknown>>({ status: 'loading' });
  readonly hits = signal<number | null>(null);
  readonly blockers = signal<readonly ColumnBlocker[]>([]);
  readonly grouped = signal(false);
  readonly focus = signal<SupervisionFocus | null>(null);
  readonly narrow = signal(false);
  readonly toggled: SupervisionFocus[] = [];
  retried = 0;
}

const OVEN: ColumnBlocker = {
  key: 'oven',
  tone: 'warning',
  count: 2,
  label: '2 commandes attendent le four',
  shortLabel: 'Four · 2',
};
const HELD: ColumnBlocker = {
  key: 'held',
  tone: 'alert',
  count: 1,
  label: '1 commande retenue',
  shortLabel: 'Retenue · 1',
};

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

  /** Supervision v2, A3 : le chiffre, puis la puce de la mise en avant à sa place. */
  it('dit son chiffre, et le cède à ce que la mise en avant trouve', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-count]')?.textContent).toContain('5');
    expect(element.querySelector('[data-count]')?.textContent).toContain('lignes ouvertes');

    fixture.componentInstance.hits.set(0);
    fixture.detectChanges();
    expect(element.querySelector('[data-count]')).toBeNull();
    expect(element.querySelector('[data-hits]')?.textContent).toContain('rien ici');

    fixture.componentInstance.hits.set(3);
    fixture.detectChanges();
    expect(element.querySelector('[data-hits]')?.textContent).toContain('3 trouvées');
  });

  it('une pastille cliquée demande sa mise en avant, et se dit active', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    fixture.componentInstance.blockers.set([OVEN]);
    fixture.componentInstance.focus.set('oven');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    const pill = element.querySelector<HTMLButtonElement>('[data-blocker="oven"]');
    expect(pill?.classList).toContain('is-on');
    pill?.click();
    expect(fixture.componentInstance.toggled).toEqual(['oven']);
  });

  it('regroupe plusieurs causes derrière une pastille, qui dit la cause choisie', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    fixture.componentInstance.blockers.set([OVEN, HELD]);
    fixture.componentInstance.grouped.set(true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-blocker-menu]')?.textContent).toContain('3 blocages');

    fixture.componentInstance.focus.set('held');
    fixture.detectChanges();
    expect(element.querySelector('[data-blocker-menu]')?.textContent).toContain('Retenue · 1');
  });

  it('projette la bande sous l’en-tête, hors du corps qui défile', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    const band = (fixture.nativeElement as HTMLElement).querySelector('.band-content');

    expect(band?.closest('.band')).not.toBeNull();
    expect(band?.closest('.body')).toBeNull();
  });

  /** Supervision v2, B5 : au téléphone, l'onglet nomme la colonne. */
  it('au téléphone, pas d’en-tête : le sous-titre et les pastilles courtes', async () => {
    const fixture = await mount({ status: 'ready', data: {}, stale: false });
    fixture.componentInstance.blockers.set([OVEN]);
    fixture.componentInstance.narrow.set(true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.head')).toBeNull();
    expect(element.querySelector('[data-subtitle]')?.textContent).toContain('4 rayons');
    expect(element.querySelector('[data-blocker="oven"]')?.textContent).toContain('Four · 2');
  });
});
