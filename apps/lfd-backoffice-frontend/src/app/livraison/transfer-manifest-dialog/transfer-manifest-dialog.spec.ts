import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { InternalTransferManifestView } from '@lfd/contracts';

import { DeliveryTransfersService } from '../delivery-transfers.service';
import { TransferManifestDialog } from './transfer-manifest-dialog';

/** Le manifeste : ses sections lues ; un échec de lecture dit « illisible » et propose de réessayer. */

const LINE = {
  sku: 'PAIN-1',
  productName: 'Pain de campagne',
  quantity: 4,
  saleUnit: 'piece' as const,
};
const SALMON = {
  sku: 'SAU-1',
  productName: 'Saumon gravlax',
  quantity: 1250,
  saleUnit: 'weight' as const,
};
const VIEW: InternalTransferManifestView = {
  transferId: 'tr_1',
  day: '2026-09-10',
  siteLabel: 'Val Village',
  departedAt: null,
  frozen: false,
  orders: {
    items: [{ itemId: 'i1', kind: 'order', subjectId: 'o1', lines: [LINE] }],
    totals: [LINE],
  },
  resupplies: { items: [], totals: [] },
  totals: [LINE],
};

async function render(manifest: () => Promise<InternalTransferManifestView>): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [TransferManifestDialog],
    providers: [{ provide: DeliveryTransfersService, useValue: { manifest } }],
  });
  const fixture = TestBed.createComponent(TransferManifestDialog);
  fixture.componentRef.setInput('data', { transferId: 'tr_1', siteLabel: 'Val Village' });
  await fixture.whenStable();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('TransferManifestDialog', () => {
  it('écrit les commandes et leurs articles', async () => {
    const host = await render(() => Promise.resolve(VIEW));
    expect(host.textContent).toContain('Commandes');
    expect(host.textContent).toContain('Pain de campagne');
    expect(host.textContent).not.toContain('Réassort');
  });

  /** R3d : le réassort du Village se lit au manifeste de l'écran, comme au papier. */
  it('écrit le réassort d’un transfert qui ne porte aucune commande', async () => {
    const host = await render(() =>
      Promise.resolve({
        ...VIEW,
        orders: { items: [], totals: [] },
        resupplies: {
          items: [{ itemId: 'i2', kind: 'resupply', subjectId: 'r-1', lines: [LINE] }],
          totals: [LINE],
        },
      }),
    );
    // R1g : « Réassort », plus « Réapprovisionnement » (décision de vocabulaire).
    expect(host.textContent).toContain('Réassorts');
    expect(host.textContent).toContain('1 réassort');
    expect(host.textContent).not.toContain('Réapprovisionnement');
    expect(host.textContent).toContain('Pain de campagne');
    expect(host.textContent).not.toContain('ne porte encore rien');
  });

  it('une commande mêlée : « 4 » pour le pain, « 1,25 kg » pour le saumon, jamais « 1250 » (P6)', async () => {
    const host = await render(() =>
      Promise.resolve({
        ...VIEW,
        orders: { ...VIEW.orders, totals: [LINE, SALMON] },
        totals: [LINE, SALMON],
      }),
    );
    const quantities = [...host.querySelectorAll('.tl-qty')].map((el) => el.textContent.trim());
    expect(quantities).toContain('4');
    expect(quantities).toContain('1,25 kg');
    expect(host.textContent).not.toContain('1250');
    expect(host.textContent).toContain('5 pièces');
  });

  it('un échec de lecture est un état d’erreur', async () => {
    const host = await render(() => Promise.reject(new Error('500')));
    expect(host.textContent).toContain('Manifeste illisible');
  });
});
