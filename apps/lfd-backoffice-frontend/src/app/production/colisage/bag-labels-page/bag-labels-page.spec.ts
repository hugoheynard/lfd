import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PackingBagLabelsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PackingContainersService } from '../../packing-containers.service';
import { BagLabelsPage } from './bag-labels-page';

/**
 * Ce que ces cas tiennent (2026-10-25, « je ne peux pas faire d'étiquette pour
 * les sacs ») : une étiquette par sac, le numéro en gros, le libellé et la
 * couleur tels que servis, le QR du RETRAIT de la commande, « Sac n/N » quand
 * il y en a plusieurs — et imprimer ne fait qu'une lecture.
 */

const VIEW: PackingBagLabelsView = {
  orderId: 'o-1',
  reference: 'ORD-0042',
  customerLabel: 'Le Bistrot',
  fulfillmentLabel: 'Retrait Village · pro',
  when: '8 h 00 – 10 h 00',
  color: '#1e88e5',
  handoverUrl: 'https://admin.test/retrait/tok-1',
  bags: [
    { containerId: 'c-1', label: 'Sac 1', rank: 1, of: 2 },
    { containerId: 'c-2', label: 'Sac 2', rank: 2, of: 2 },
  ],
};

let calls: string[];

async function settle(fixture: ComponentFixture<BagLabelsPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  served: PackingBagLabelsView | HttpErrorResponse = VIEW,
  sacs?: string,
): Promise<HTMLElement> {
  calls = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PackingContainersService,
        useValue: {
          bagLabels: (date: string, orderId: string) => {
            calls.push(`read ${date} ${orderId}`);
            return served instanceof HttpErrorResponse
              ? Promise.reject(served)
              : Promise.resolve(served);
          },
        } satisfies Partial<Record<keyof PackingContainersService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(BagLabelsPage);
  fixture.componentRef.setInput('date', '2026-10-05');
  fixture.componentRef.setInput('orderId', 'o-1');
  if (sacs !== undefined) {
    fixture.componentRef.setInput('sacs', sacs);
  }
  fixture.detectChanges();
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

function text(root: Element | null | undefined, selector: string): string | undefined {
  return root?.querySelector(selector)?.textContent?.trim();
}

describe('BagLabelsPage', () => {
  it('une étiquette par sac : le numéro, le client, l’acheminement, le créneau, « Sac n/N »', async () => {
    const element = await boot();
    const labels = [...element.querySelectorAll('[data-bag-label-sheet]')];
    expect(labels).toHaveLength(2);
    expect(text(labels[0], '[data-bag-reference]')).toBe('ORD-0042');
    expect(labels[0]?.textContent).toContain('Le Bistrot');
    expect(text(labels[0], '[data-bag-method]')).toBe('Retrait Village · pro');
    expect(text(labels[0], '[data-bag-when]')).toBe('8 h 00 – 10 h 00');
    expect(labels.map((label) => text(label, '[data-bag-rank]'))).toEqual(['Sac 1/2', 'Sac 2/2']);
  });

  it('pose le carré de couleur servi devant l’acheminement', async () => {
    const element = await boot();
    const square = element.querySelector<HTMLElement>('[data-bag-method] [data-bag-color]');
    expect(square?.style.backgroundColor).toBe('rgb(30, 136, 229)');
  });

  it('🔴 sans couleur servie : aucun carré, jamais une teinte devinée', async () => {
    const element = await boot({ ...VIEW, color: null });
    expect(element.querySelector('[data-bag-color]')).toBeNull();
  });

  it('encode le QR du RETRAIT de la commande, celui que le comptoir scanne', async () => {
    const element = await boot();
    const qr = element.querySelector('[data-bag-label-sheet] svg');
    expect(qr?.getAttribute('aria-label')).toBe('QR code : https://admin.test/retrait/tok-1');
  });

  it('sans jeton montrable : pas de QR, et la page le dit', async () => {
    const element = await boot({ ...VIEW, handoverUrl: '' });
    expect(element.querySelector('[data-bag-label-sheet] svg')).toBeNull();
    expect(element.querySelector('[data-no-qr]')).not.toBeNull();
  });

  it('un seul sac : pas de « Sac 1/1 »', async () => {
    const element = await boot({
      ...VIEW,
      bags: [{ containerId: 'c-1', label: 'Sac 1', rank: 1, of: 1 }],
    });
    expect(element.querySelector('[data-bag-rank]')).toBeNull();
  });

  it('n’imprime que le sac choisi au poste, et dit que les autres existent', async () => {
    const element = await boot(VIEW, 'c-2');
    expect(element.querySelectorAll('app-bag-label')).toHaveLength(1);
    expect(text(element, '[data-bag-rank]')).toBe('Sac 2/2');
    expect(element.querySelector('[data-labels-all]')).not.toBeNull();
  });

  it('🔴 une LECTURE : imprimer ne crée aucun sac', async () => {
    await boot();
    expect(calls).toEqual(['read 2026-10-05 o-1']);
  });

  it('une commande absente du poste : le refus du serveur, tel quel', async () => {
    const refusal = new HttpErrorResponse({
      status: 404,
      error: { code: 'packing.bag_labels.sheet_not_found', message: 'Pas au poste de ce jour.' },
    });
    const element = await boot(refusal);
    expect(element.querySelector('[data-labels-error]')?.textContent).toContain(
      'Pas au poste de ce jour.',
    );
  });
});
