import { TestBed } from '@angular/core/testing';
import type { MarketConfigView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { MarketService } from '../../../../commercial/market/market.service';
import { MarketCard } from '../market-card';

const CONFIG: MarketConfigView = {
  zones: [{ codePostal: '75011', addressable: 12, perNaf: [], fetchedAt: null }],
  nafCodes: [{ code: '10.71C', label: 'Boulangerie' }],
  lastRefreshedAt: null,
};
const EMPTY: MarketConfigView = { zones: [], nafCodes: [], lastRefreshedAt: null };

async function render(): Promise<{
  element: HTMLElement;
  service: Pick<MarketService, 'config' | 'removeZone' | 'removeNaf'>;
  settle: () => Promise<void>;
}> {
  const service = {
    config: vi.fn(async () => CONFIG),
    removeZone: vi.fn(async () => EMPTY),
    removeNaf: vi.fn(async () => EMPTY),
  };
  TestBed.configureTestingModule({ providers: [{ provide: MarketService, useValue: service }] });
  const fixture = TestBed.createComponent(MarketCard);
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  return { element: fixture.nativeElement as HTMLElement, service, settle };
}

function cross(element: HTMLElement, label: string): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (button === null) {
    throw new Error(`croix « ${label} » introuvable`);
  }
  return button;
}

describe('MarketCard — la croix de retrait', () => {
  it('retire la zone visée', async () => {
    const { element, service, settle } = await render();
    cross(element, 'Retirer la zone 75011').click();
    await settle();
    expect(service.removeZone).toHaveBeenCalledWith('75011');
    expect(element.textContent).toContain('Aucune zone ciblée.');
  });

  it('retire le code NAF visé', async () => {
    const { element, service, settle } = await render();
    cross(element, 'Retirer le code NAF 10.71C').click();
    await settle();
    expect(service.removeNaf).toHaveBeenCalledWith('10.71C');
    expect(element.textContent).toContain('Aucune catégorie ciblée.');
  });
});
