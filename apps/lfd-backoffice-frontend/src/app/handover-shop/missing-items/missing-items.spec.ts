import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { FulfillmentMethod } from '@lfd/contracts';

import { MissingItems } from './missing-items';

const LINES = [{ sku: 'CROI-NAT', productName: 'Croissant nature', quantity: 2 }];

async function render(
  method: FulfillmentMethod,
  lines = LINES,
): Promise<ComponentFixture<MissingItems>> {
  TestBed.configureTestingModule({ imports: [MissingItems] });
  const fixture = TestBed.createComponent(MissingItems);
  fixture.componentRef.setInput('lines', lines);
  fixture.componentRef.setInput('fulfillmentMethod', method);
  await fixture.whenStable();
  return fixture;
}

const text = (fixture: ComponentFixture<MissingItems>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('MissingItems', () => {
  it('au retrait, dit « Commande incomplète » et le sac, jamais « départ »', async () => {
    const said = text(await render('pickup'));

    expect(said).toContain('Commande incomplète — ces articles ne sont pas dans le sac');
    expect(said).toContain('2 Croissant nature');
    expect(said).not.toMatch(/départ|Reste abandonné/i);
  });

  it('en livraison, garde « Départ incomplet. Ces articles ne partent pas »', async () => {
    const said = text(await render('delivery'));

    expect(said).toContain('Départ incomplet. Ces articles ne partent pas');
    expect(said).toContain('2 Croissant nature');
    expect(said).not.toContain('Reste abandonné');
  });

  it('n’invite jamais à prévenir le client — c’est une décision du commerce', async () => {
    expect(text(await render('pickup'))).not.toMatch(/prévenez|dites|client/i);
  });

  it('sans reste, ne rend rien', async () => {
    expect(text(await render('pickup', [])).trim()).toBe('');
  });
});
