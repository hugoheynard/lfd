import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminBackorderView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { backorderAgeOf } from '../backorder-words';
import { AdminBackordersService } from '../backorders.service';
import { BackordersPage } from './backorders-page';

const DAY_MS = 86_400_000;
/** Né il y a trois jours : l'âge se lit relativement à maintenant. */
const THREE_DAYS_AGO = new Date(Date.now() - 3 * DAY_MS).toISOString();

const OPEN: AdminBackorderView = {
  id: 'bo_1',
  state: 'open',
  createdAt: THREE_DAYS_AGO,
  origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
  company: { id: 'co_1', name: 'Café du Port' },
  buyer: { userId: 'u_1', name: 'Léa Martin' },
  lines: [
    { sku: 'CRO', productName: 'Croissant', quantity: 3, saleUnit: 'piece' },
    { sku: 'SEI', productName: 'Pain de seigle', quantity: 750, saleUnit: 'weight' },
  ],
  convertedOrder: null,
  closedAt: null,
};

async function mount(list: ReturnType<typeof vi.fn>): Promise<ComponentFixture<BackordersPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminBackordersService, useValue: { list } }],
  });
  const fixture = TestBed.createComponent(BackordersPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<BackordersPage>) => f.nativeElement as HTMLElement;
const text = (f: ComponentFixture<BackordersPage>) =>
  (el(f).textContent ?? '').replace(/\s+/gu, ' ');

describe('BackordersPage — reliquats à traiter', () => {
  it('lit les reliquats OUVERTS seulement', async () => {
    const list = vi.fn(() => Promise.resolve([OPEN]));
    await mount(list);
    expect(list).toHaveBeenCalledWith('open');
  });

  it('montre la société, la commande d’origine liée, les lignes et l’âge', async () => {
    const fixture = await mount(vi.fn(() => Promise.resolve([OPEN])));
    expect(text(fixture)).toContain('Café du Port');
    expect(text(fixture)).toContain('Léa Martin');
    expect(text(fixture)).toContain('3 × Croissant');
    expect(text(fixture)).toContain('Pain de seigle');
    expect(text(fixture)).toContain('il y a 3 jours');
    const origin = el(fixture).querySelector<HTMLAnchorElement>('[data-backorder-origin]');
    expect(origin?.textContent).toContain('ORD-0042');
    expect(origin?.getAttribute('href')).toBe('/commandes/ord_1');
  });

  it('dit « Particulier » quand le reliquat n’a pas de société', async () => {
    const fixture = await mount(vi.fn(() => Promise.resolve([{ ...OPEN, company: null }])));
    expect(text(fixture)).toContain('Particulier');
  });

  it('dit le vide par fold, sans inviter à rien créer', async () => {
    const fixture = await mount(vi.fn(() => Promise.resolve([])));
    expect(el(fixture).querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Aucun reliquat à traiter');
    expect(el(fixture).querySelector('[data-backorders]')).toBeNull();
  });

  it('dit l’échec de lecture, avec la phrase du serveur, et propose de réessayer', async () => {
    const refusal = new HttpErrorResponse({
      status: 403,
      error: { code: 'staff.forbidden', message: 'Accès refusé.' },
    });
    const list = vi.fn(() => Promise.reject(refusal));
    const fixture = await mount(list);
    expect(text(fixture)).toContain('Impossible de lire les reliquats');
    expect(text(fixture)).toContain('Accès refusé.');
    expect(text(fixture)).toContain('Réessayer');
  });
});

describe('backorderAgeOf', () => {
  const now = new Date(2030, 0, 10, 15, 0);
  it('dit « aujourd’hui », « hier », puis les jours', () => {
    expect(backorderAgeOf(new Date(2030, 0, 10, 8, 0).toISOString(), now)).toBe('aujourd’hui');
    expect(backorderAgeOf(new Date(2030, 0, 9, 23, 0).toISOString(), now)).toBe('hier');
    expect(backorderAgeOf(new Date(2030, 0, 6, 9, 0).toISOString(), now)).toBe('il y a 4 jours');
  });
});
