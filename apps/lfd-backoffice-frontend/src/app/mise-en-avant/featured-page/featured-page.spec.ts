import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogAdminItemView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { ShopCopyService } from '../../textes-boutique/data/shop-copy.service';
import { adminView, entryView } from '../../textes-boutique/shop-copy.testing';
import { BADGE_COPY_KEY } from '../rules/badge-copy';
import { FeaturedPage } from './featured-page';

function item(over: Partial<CatalogAdminItemView> = {}): CatalogAdminItemView {
  return {
    sku: 'VIE-001-1',
    productSku: 'VIE-001',
    name: 'Croissant',
    categoryId: 'cat_vien',
    categoryName: 'Viennoiseries',
    pimPriceMillicents: 170_616,
    vatRatePercent: 5.5,
    publicTtcCents: 225,
    publicVatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    audience: null,
    isFeaturedPro: false,
    isFeaturedPublic: false,
    operationOnly: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

async function render(
  items: readonly CatalogAdminItemView[],
  permissions: readonly StaffPermission[],
) {
  const setFeatured = vi.fn(() => Promise.resolve());
  TestBed.configureTestingModule({
    imports: [FeaturedPage],
    providers: [
      provideRouter([]),
      { provide: CatalogueService, useValue: { list: () => Promise.resolve(items), setFeatured } },
      {
        provide: ShopCopyService,
        useValue: {
          load: () =>
            Promise.resolve(adminView([entryView(BADGE_COPY_KEY, 'product', 'Incontournable')])),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(FeaturedPage);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, setFeatured, element: fixture.nativeElement as HTMLElement };
}

function boxes(element: HTMLElement): readonly HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

describe('FeaturedPage — Gestion Boutique › Mise en avant', () => {
  it('montre le libellé de la pastille, et le lien vers Textes de la boutique', async () => {
    const { element } = await render([item()], ['lfc_catalog:read', 'b2b_storefront:read']);
    expect(element.textContent).toContain('Incontournable');
    const link = element.querySelector<HTMLAnchorElement>('a[href*="textes-boutique"]');
    expect(link?.getAttribute('href')).toContain('cle=product.bestSeller');
  });

  it('sans le droit des textes, pas de bloc du libellé', async () => {
    const { element } = await render([item()], ['lfc_catalog:read']);
    expect(element.textContent).not.toContain('Le libellé de la pastille');
  });

  it('ferme la case du public d’un article vendu aux pros seulement, et dit pourquoi', async () => {
    const { element } = await render(
      [item({ audience: 'pro' })],
      ['lfc_catalog:read', 'lfc_catalog:write'],
    );
    const [pro, publique] = boxes(element);
    expect(pro?.disabled).toBe(false);
    expect(publique?.disabled).toBe(true);
    expect(element.textContent).toContain('Non vendu au public');
  });

  it('bascule une audience par la route de mise en avant', async () => {
    const { element, setFeatured, fixture } = await render(
      [item()],
      ['lfc_catalog:read', 'lfc_catalog:write'],
    );
    boxes(element)[0]?.click();
    await fixture.whenStable();
    expect(setFeatured).toHaveBeenCalledWith('VIE-001-1', 'pro', true);
  });

  it('sans le droit d’écrire, tout se lit et rien ne bascule', async () => {
    const { element } = await render([item()], ['lfc_catalog:read']);
    expect(boxes(element).every((box) => box.disabled)).toBe(true);
  });
});
