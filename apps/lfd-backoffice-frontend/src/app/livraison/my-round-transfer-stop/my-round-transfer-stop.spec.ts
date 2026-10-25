import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DriverTransferStopView } from '@lfd/contracts';

import { MyRoundTransferStop } from './my-round-transfer-stop';

/**
 * L'arrêt de transfert de « Ma tournée » : ce qu'on décharge — par section —,
 * les bacs, l'adresse du site, « Aller à ce site », et « Remis au site » seulement en
 * route et sur un arrêt encore ouvert.
 */

const LINE = { sku: 'PAIN-1', productName: 'Pain de campagne', quantity: 6 };

const STOP: DriverTransferStopView = {
  stopId: 'ts_1',
  transferId: 'tr_1',
  position: 2,
  closedAt: null,
  siteLabel: 'Val Village',
  orderCount: 2,
  receivedAt: null,
  totals: [LINE],
  orders: {
    items: [
      { itemId: 'i1', kind: 'order', subjectId: 'o1', lines: [{ ...LINE, quantity: 2 }] },
      { itemId: 'i2', kind: 'order', subjectId: 'o2', lines: [{ ...LINE, quantity: 4 }] },
    ],
    totals: [LINE],
  },
  resupplies: { items: [], totals: [] },
  binCount: 3,
  siteAddress: {
    label: 'Val Village',
    ligne1: 'Route du Village',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
  siteGps: { lat: 45.45, lng: 6.98 },
};

async function render(
  stop: DriverTransferStopView,
  gestures: boolean,
  goTo: string | null = null,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [MyRoundTransferStop] });
  const fixture = TestBed.createComponent(MyRoundTransferStop);
  fixture.componentRef.setInput('stop', stop);
  fixture.componentRef.setInput('gestures', gestures);
  fixture.componentRef.setInput('goTo', goTo);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MyRoundTransferStop', () => {
  it('montre le site, les totaux par article et « Remis au site » en route', async () => {
    const host = await render(STOP, true);
    expect(host.textContent).toContain('→ Val Village');
    expect(host.textContent).toContain('2 commandes · 6 pièces');
    expect(host.textContent).toContain('Pain de campagne');
    expect(host.querySelector('[data-site-drop]')).not.toBeNull();
  });

  it('montre le manifeste détaillé à tout livreur, sans droit des tournées', async () => {
    const host = await render(STOP, true);
    const section = host.querySelector('[data-manifest-section="orders"]');
    expect(section?.textContent).toContain('Commandes');
    expect(section?.textContent).toContain('2 commandes · 6 pièces');
    expect(host.querySelector('[data-manifest-section="resupplies"]')).toBeNull();
    expect(host.querySelector('[data-manifest-total]')).toBeNull();
  });

  it('dit les bacs et l’adresse du site', async () => {
    const host = await render(STOP, true);
    expect(host.querySelector('[data-transfer-bins]')?.textContent).toContain('3 bacs à remettre');
    expect(host.querySelector('[data-transfer-address]')?.textContent).toContain(
      'Route du Village, 73150 Val',
    );
    const none = await renderFresh({ ...STOP, binCount: 0, siteAddress: null });
    expect(none.querySelector('[data-transfer-bins]')?.textContent).toContain('Aucun bac déclaré');
    expect(none.querySelector('[data-transfer-address]')).toBeNull();
  });

  it('« Aller à ce site » mène au site quand le lien est donné', async () => {
    const href = 'https://www.google.com/maps/dir/?api=1&destination=45.45,6.98';
    const link = (await render(STOP, true, href)).querySelector('[data-go-to]');
    expect(link?.getAttribute('href')).toBe(href);
    expect((await renderFresh(STOP)).querySelector('[data-go-to]')).toBeNull();
  });

  it('au dépôt, aucun geste', async () => {
    expect((await render(STOP, false)).querySelector('[data-site-drop]')).toBeNull();
  });

  it('clos, le dit et n’offre plus rien', async () => {
    const host = await render({ ...STOP, closedAt: '2026-09-10T07:40:00.000Z' }, true);
    expect(host.querySelector('[data-site-drop]')).toBeNull();
    expect(host.querySelector('[data-transfer-status]')).not.toBeNull();
  });
});

/** Un second rendu dans le même test : le module de test est remis à zéro. */
async function renderFresh(stop: DriverTransferStopView): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  return render(stop, true);
}
