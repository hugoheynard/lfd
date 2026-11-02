import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PackingResupplyView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PackingService } from '../../packing.service';
import { PackingResupplies } from './packing-resupplies';

/** Les fiches de réassort au colisage (R3d) : saisir l'emballé, clore. */
const DAY = '2026-10-22';

function fiche(packed: number | null, status: 'open' | 'closed' = 'open'): PackingResupplyView {
  return {
    resupplyId: 'r-1',
    title: 'Réassort Village',
    kind: 'evening',
    siteId: 'site-v',
    destination: { kind: 'transfer', siteId: 'site-v' },
    status,
    awaitingOven: false,
    closedAt: null,
    lines: [
      {
        sku: 'PAC',
        productName: 'Pain au chocolat',
        requested: 18,
        packed,
        saleUnit: 'piece',
        awaitingOven: 0,
      },
    ],
  };
}

class Packing {
  current: readonly PackingResupplyView[] = [];
  readonly enterResupplyLine = vi.fn(async () => undefined);
  readonly closeResupply = vi.fn(async () => undefined);
  async resupplies(
    date: string,
  ): Promise<{ date: string; resupplies: readonly PackingResupplyView[] }> {
    return { date, resupplies: this.current };
  }
}

async function mount(
  packing: Packing,
): Promise<{ fixture: ComponentFixture<PackingResupplies>; el: HTMLElement }> {
  TestBed.configureTestingModule({ providers: [{ provide: PackingService, useValue: packing }] });
  const fixture = TestBed.createComponent(PackingResupplies);
  fixture.componentRef.setInput('date', DAY);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function button(el: HTMLElement, selector: string): HTMLButtonElement {
  const found = el.querySelector<HTMLButtonElement>(selector);
  if (found === null) {
    throw new Error(`${selector} absent`);
  }
  return found;
}

describe('PackingResupplies', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('dit qu’il n’y a aucune fiche', async () => {
    const { el } = await mount(new Packing());
    expect(el.textContent).toContain('Aucune fiche de réassort');
  });

  it('ne laisse clore qu’une fiche dont toutes les lignes sont saisies', async () => {
    const packing = new Packing();
    packing.current = [fiche(null)];
    const { el } = await mount(packing);

    expect(el.textContent).toContain('Réassort Village');
    expect(button(el, 'button.pr-close').disabled).toBe(true);
    expect(button(el, 'button.pr-save').disabled).toBe(true);
  });

  it('enregistre la saisie d’une ligne, puis relit', async () => {
    const packing = new Packing();
    packing.current = [fiche(null)];
    const { fixture, el } = await mount(packing);

    fixture.componentInstance['setDraft'](fiche(null), fiche(null).lines[0]!, 12);
    fixture.detectChanges();
    packing.current = [fiche(12)];
    button(el, 'button.pr-save').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(packing.enterResupplyLine).toHaveBeenCalledWith(DAY, 'r-1', 'PAC', 12);
    expect(button(el, 'button.pr-close').disabled).toBe(false);
  });

  it('clôt la fiche, et montre le refus du serveur tel quel', async () => {
    const packing = new Packing();
    packing.current = [fiche(12)];
    packing.closeResupply.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 409, error: { message: 'La réserve n’a pas les pièces.' } }),
    );
    const { fixture, el } = await mount(packing);

    button(el, 'button.pr-close').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(packing.closeResupply).toHaveBeenCalledWith(DAY, 'r-1');
    expect(el.querySelector('.pr-failure')?.textContent).toContain(
      'La réserve n’a pas les pièces.',
    );
  });

  it('une fiche close montre l’emballé, sans saisie ni bouton', async () => {
    const packing = new Packing();
    packing.current = [fiche(12, 'closed')];
    const { el } = await mount(packing);

    expect(el.querySelector('fold-number-input')).toBeNull();
    expect(el.querySelector('button.pr-close')).toBeNull();
    expect(el.textContent).toContain('Close');
  });

  /** Lot R4b : la fiche « au plus tôt » attend ce que le four n'a pas remis. */
  it('une fiche « au plus tôt » dit qu’elle attend le four, et combien par ligne', async () => {
    const packing = new Packing();
    const asap = fiche(null);
    packing.current = [
      {
        ...asap,
        title: 'Réassort Village · au plus tôt',
        kind: 'asap',
        awaitingOven: true,
        lines: [{ ...asap.lines[0]!, awaitingOven: 5 }],
      },
    ];
    const { el } = await mount(packing);

    expect(el.textContent).toContain('Réassort Village · au plus tôt');
    expect(el.textContent).toContain('En attente du four');
    expect(el.querySelector('[data-awaiting-oven]')?.textContent).toContain('5 attendus du four');
  });

  /** Lot L2b-4 : un réassort au poids se lit en kilos et se saisit en grammes. */
  describe('au poids', () => {
    function weighed(packed: number | null, status: 'open' | 'closed' = 'open') {
      const base = fiche(packed, status);
      return {
        ...base,
        lines: [
          {
            sku: 'SAU',
            productName: 'Saumon gravlax',
            requested: 2000,
            packed,
            saleUnit: 'weight' as const,
            awaitingOven: 0,
          },
        ],
      };
    }

    it('dit le demandé « 2 kg », relit la saisie en kilos et envoie des grammes', async () => {
      const packing = new Packing();
      packing.current = [weighed(null)];
      const { fixture, el } = await mount(packing);

      expect(el.querySelector('.pr-requested')?.textContent).toContain('2 kg');
      expect(el.querySelector('.pr-requested')?.textContent).not.toContain('2000');
      fixture.componentInstance['setDraft'](weighed(null), weighed(null).lines[0]!, 1940);
      fixture.detectChanges();
      expect(el.textContent).toContain('1,94 kg sur 2 kg');
      packing.current = [weighed(1940)];
      button(el, 'button.pr-save').click();
      await fixture.whenStable();

      expect(packing.enterResupplyLine).toHaveBeenCalledWith(DAY, 'r-1', 'SAU', 1940);
    });

    it('montre le refus du serveur « entre 0 et 2 kg » tel quel', async () => {
      const packing = new Packing();
      packing.current = [weighed(null)];
      const refusal =
        'La quantité emballée de « Saumon gravlax » doit être un nombre entier de grammes entre 0 et 2000 (2 kg), le poids demandé.';
      packing.enterResupplyLine.mockRejectedValueOnce(
        new HttpErrorResponse({ status: 400, error: { message: refusal } }),
      );
      const { fixture, el } = await mount(packing);

      fixture.componentInstance['setDraft'](weighed(null), weighed(null).lines[0]!, 2500);
      fixture.detectChanges();
      button(el, 'button.pr-save').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelector('.pr-failure')?.textContent).toContain('(2 kg)');
    });

    it('une fiche close dit l’emballé en kilos ; la pièce reste un nombre nu', async () => {
      const packing = new Packing();
      packing.current = [weighed(1940, 'closed'), { ...fiche(12, 'closed'), resupplyId: 'r-2' }];
      const { el } = await mount(packing);

      expect(el.querySelector('tr[data-sku="SAU"]')?.textContent).toContain('1,94 kg');
      const pac = el.querySelector('tr[data-sku="PAC"]')?.textContent ?? '';
      expect(pac).toContain('12');
      expect(pac).not.toContain('kg');
    });
  });
});
