import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { BarSheet } from './bar-sheet.service';

/** Une vraie référence, dont on observe la fermeture. */
function sheet(): { readonly ref: FoldPanelRef<void>; closed: boolean } {
  const handle = {
    closed: false,
    ref: new FoldPanelRef<void>(1, () => {
      handle.closed = true;
    }),
  };
  return handle;
}

describe('BarSheet — une seule feuille de barre', () => {
  it("ouvrir l'une ferme l'autre", async () => {
    const sheets = TestBed.inject(BarSheet);
    const cart = sheet();
    const bell = sheet();

    await sheets.toggle('cart', () => cart.ref);
    await sheets.toggle('notifications', () => bell.ref);

    expect(cart.closed).toBe(true);
    expect(bell.closed).toBe(false);
    expect(sheets.openKey()).toBe('notifications');
  });

  it('recliquer sur la même la referme sans rien rouvrir', async () => {
    const sheets = TestBed.inject(BarSheet);
    const cart = sheet();
    let opens = 0;
    const open = (): FoldPanelRef<void> => {
      opens++;
      return cart.ref;
    };

    await sheets.toggle('cart', open);
    await sheets.toggle('cart', open);

    expect(cart.closed).toBe(true);
    expect(opens).toBe(1);
    expect(sheets.openKey()).toBeNull();
  });
});
