import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PackingContainerStep, PackingLine, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PackingOpenOrder, type PackingLineToggle } from './packing-open-order';

/**
 * Un composant de présentation : il affiche ce qu'on lui donne — y compris un
 * chiffre ou une règle incohérents avec les lignes, tels quels — et il émet le
 * bon geste.
 */

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...over,
  };
}

function sheet(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    containers: 0,
    customerLabel: 'Hôtel du Parc',
    fulfillmentMethod: 'delivery',
    destination: '12 rue des Lilas',
    lines: [line(), line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
    lineCount: 2,
    packedLines: 0,
    remainingLines: 2,
    pieces: 20,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    ...over,
  };
}

function render(inputs: Readonly<Record<string, unknown>>): ComponentFixture<PackingOpenOrder> {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PackingOpenOrder);
  for (const [name, value] of Object.entries({ canSetContainers: true, ...inputs })) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('la commande ouverte du colisage', () => {
  it('affiche les lignes dans le bac telles que servies, même incohérentes', () => {
    const fixture = render({ sheet: sheet({ lineCount: 9, packedLines: 5 }) });
    const host: HTMLElement = fixture.nativeElement;

    // Deux lignes réellement là, et le serveur dit « 5 sur 9 » : c'est ce qui se lit.
    expect(host.querySelectorAll('.co-line')).toHaveLength(2);
    expect(said(host.querySelector('.co-band-sum'))).toBe('5 lignes sur 9 dans la commande');
  });

  it('arme « Déclarer prête » selon le serveur, ligne dehors ou non', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: true, remainingLines: 2 }) });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(false);
    expect(said(host.querySelector('.co-close'))).not.toContain('encore dehors');
  });

  it('désarme « Déclarer prête » pendant la déclaration en vol', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: true }), closing: true });
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector<HTMLButtonElement>('.co-close button')?.disabled).toBe(true);
  });

  it('dit les lignes encore dehors avec le chiffre servi', () => {
    const fixture = render({ sheet: sheet({ canDeclareReady: false, remainingLines: 42 }) });
    const host: HTMLElement = fixture.nativeElement;

    expect(said(host.querySelector('.co-close'))).toContain('42 lignes encore dehors');
  });

  it('émet la déclaration', () => {
    const fixture = render({
      sheet: sheet({ canDeclareReady: true }),
      readyLabel: 'Déclarer prête pour la livraison',
    });
    const host: HTMLElement = fixture.nativeElement;
    let declared = 0;
    fixture.componentInstance.declareReady.subscribe(() => (declared += 1));

    const button = host.querySelector<HTMLButtonElement>('.co-close button');
    expect(said(button)).toBe('Déclarer prête pour la livraison');
    button?.click();

    expect(declared).toBe(1);
  });

  it('émet la coche avec la ligne SERVIE et le sens voulu', () => {
    const fixture = render({ sheet: sheet() });
    const host: HTMLElement = fixture.nativeElement;
    const toggles: PackingLineToggle[] = [];
    fixture.componentInstance.toggled.subscribe((toggle) => toggles.push(toggle));

    host.querySelector<HTMLInputElement>('.co-line input[type="checkbox"]')?.click();

    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.packed).toBe(true);
    expect(toggles[0]?.line.sku).toBe('CRO');
    expect(toggles[0]?.line.packed).toBe(false);
  });

  it('émet un sens de container, `add` ou `remove`', () => {
    const fixture = render({ sheet: sheet({ containers: 3 }) });
    const host: HTMLElement = fixture.nativeElement;
    const steps: PackingContainerStep[] = [];
    fixture.componentInstance.containerStep.subscribe((step) => steps.push(step));

    host.querySelector<HTMLButtonElement>('.co-container-step--add')?.click();
    host
      .querySelector<HTMLButtonElement>('.co-container-step:not(.co-container-step--add)')
      ?.click();

    expect(steps).toEqual(['add', 'remove']);
  });

  it('recouvre seulement l’état de la case en vol, et la désarme', () => {
    const fixture = render({
      sheet: sheet(),
      shownPacked: new Map([['CRO', true]]),
      busySkus: new Set(['CRO']),
    });
    const host: HTMLElement = fixture.nativeElement;
    const lines = host.querySelectorAll('.co-line');

    expect(lines).toHaveLength(2);
    expect(lines[0]?.classList.contains('is-packed')).toBe(true);
    expect(lines[0]?.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    expect(lines[1]?.classList.contains('is-packed')).toBe(false);
  });

  it('dit lequel des deux cas quand aucune commande n’est ouverte', () => {
    const todo = render({ sheet: null, stack: 'todo' });
    const todoHost: HTMLElement = todo.nativeElement;
    expect(todoHost.textContent).toContain('Tout est déclaré prêt');

    const ready = render({ sheet: null, stack: 'ready' });
    const readyHost: HTMLElement = ready.nativeElement;
    expect(readyHost.textContent).toContain('Rien n’est encore prêt');
  });
});
