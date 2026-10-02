import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderHandoverProofResponse, OrderHandoverProofView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { HandoverProofCard } from './handover-proof-card';

const HANDED: OrderHandoverProofView = {
  mode: 'handed',
  handedOverAt: '2030-03-12T08:10:00.000Z',
  courierName: 'Paul Roux',
  pieces: { receiverName: 'Mme Durand', hasSignature: true },
};

/** Le transport doublé : la preuve qu'il rend, et les images demandées. */
class FakeOrders {
  asked: string[] = [];

  constructor(
    private readonly response: OrderHandoverProofResponse,
    private readonly failImages = false,
  ) {}

  handoverProof(id: string): Promise<OrderHandoverProofResponse> {
    this.asked.push(`preuve ${id}`);
    return Promise.resolve(this.response);
  }

  handoverProofImage(id: string, piece: 'photo' | 'signature'): Promise<Blob> {
    this.asked.push(`${piece} ${id}`);
    return this.failImages
      ? Promise.reject(new Error('404'))
      : Promise.resolve(new Blob(['x'], { type: 'image/jpeg' }));
  }
}

async function boot(
  fake: FakeOrders,
): Promise<{ fixture: ComponentFixture<HandoverProofCard>; element: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminOrdersService,
        useValue: fake satisfies Pick<AdminOrdersService, 'handoverProof' | 'handoverProofImage'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(HandoverProofCard);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.detectChanges();
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('HandoverProofCard — « Preuve de livraison »', () => {
  it('une remise montre le mode, le livreur, le réceptionnaire, la photo et la signature', async () => {
    const fake = new FakeOrders({ proof: HANDED });
    const { element } = await boot(fake);

    const card = element.querySelector('[data-proof-card]');
    expect(card?.textContent).toContain('Remis en main propre');
    expect(card?.textContent).toContain('Paul Roux');
    expect(element.querySelector('[data-receiver]')?.textContent).toContain('Mme Durand');
    expect(element.querySelector('[data-photo]')).not.toBeNull();
    expect(element.querySelector('[data-signature]')).not.toBeNull();
    expect(fake.asked).toEqual(['preuve o-1', 'photo o-1', 'signature o-1']);
  });

  it('un dépôt : ni réceptionnaire ni signature demandée', async () => {
    const fake = new FakeOrders({
      proof: { ...HANDED, mode: 'deposited', pieces: { receiverName: null, hasSignature: false } },
    });
    const { element } = await boot(fake);

    expect(element.querySelector('[data-proof-card]')?.textContent).toContain('Déposé');
    expect(element.querySelector('[data-receiver]')).toBeNull();
    expect(element.querySelector('[data-signature]')).toBeNull();
    expect(fake.asked).toEqual(['preuve o-1', 'photo o-1']);
  });

  it('une commande sans preuve ne rend rien', async () => {
    const { element } = await boot(new FakeOrders({ proof: null }));

    expect(element.querySelector('[data-proof-card]')).toBeNull();
    expect(element.querySelector('fold-callout')).toBeNull();
  });

  it('des pièces effacées le disent, sans demander d’image', async () => {
    const fake = new FakeOrders({ proof: { ...HANDED, pieces: null } });
    const { element } = await boot(fake);

    expect(element.querySelector('[data-proof-erased]')?.textContent).toContain('Preuve effacée');
    expect(fake.asked).toEqual(['preuve o-1']);
  });

  it('des images illisibles le disent, la carte reste', async () => {
    const { element } = await boot(new FakeOrders({ proof: HANDED }, true));

    expect(element.querySelector('[data-proof-card]')).not.toBeNull();
    expect(element.querySelector('[data-images-error]')).not.toBeNull();
  });
});
