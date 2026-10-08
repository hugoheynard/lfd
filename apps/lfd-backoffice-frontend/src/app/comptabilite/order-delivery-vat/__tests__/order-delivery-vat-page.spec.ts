import { TestBed } from '@angular/core/testing';
import type { OrderDeliveryVatView, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { OrderDeliveryVatPage } from '../order-delivery-vat-page';
import { OrderDeliveryVatService } from '../order-delivery-vat.service';

interface Harness {
  readonly page: OrderDeliveryVatPage;
  readonly save: ReturnType<typeof vi.fn>;
}

const WRITE: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'];

async function mount(
  view: OrderDeliveryVatView | Error,
  permissions: readonly StaffPermission[] = WRITE,
): Promise<Harness> {
  const save = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: OrderDeliveryVatService,
        useValue: {
          read: async () => {
            if (view instanceof Error) {
              throw view;
            }
            return view;
          },
          save,
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new OrderDeliveryVatPage());
  await TestBed.runInInjectionContext(() => page['load']());
  return { page, save };
}

describe("l'écran de TVA de la livraison", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit « non réglé » et laisse confirmer le taux normal comme un choix', async () => {
    // Le serveur répond `standard` sans réglage posé : l'écran ne doit pas faire
    // passer ce repli pour une décision, et doit permettre de l'enregistrer.
    const { page, save } = await mount({ mode: 'standard', configured: false });

    expect(page['configured']()).toBe(false);
    expect(page['dirty']()).toBe(true);
    await page['submit']();
    expect(save).toHaveBeenCalledWith({ mode: 'standard' });
  });

  it("n'envoie rien quand le mode réglé n'a pas changé", async () => {
    const { page, save } = await mount({ mode: 'follows_goods', configured: true });

    expect(page['dirty']()).toBe(false);
    await page['submit']();
    expect(save).not.toHaveBeenCalled();
  });

  it('enregistre le mode choisi', async () => {
    const { page, save } = await mount({ mode: 'standard', configured: true });
    page['onMode']('follows_goods');

    expect(page['whenRight']()).toContain('accessoire de la vente');
    await page['submit']();
    expect(save).toHaveBeenCalledWith({ mode: 'follows_goods' });
  });

  it('se lit seulement sans `b2b_accounting:write`', async () => {
    // Le droit est celui de la comptabilité, PAS celui de la surtaxe.
    const { page, save } = await mount({ mode: 'standard', configured: true }, [
      'b2b_accounting:read',
      'b2b_late_fee:write',
    ]);
    page['onMode']('follows_goods');

    expect(page['canWrite']()).toBe(false);
    await page['submit']();
    expect(save).not.toHaveBeenCalled();
  });

  it('passe en erreur quand le réglage ne répond pas', async () => {
    const { page } = await mount(new Error('500'));

    expect(page['state']()).toBe('error');
  });
});
