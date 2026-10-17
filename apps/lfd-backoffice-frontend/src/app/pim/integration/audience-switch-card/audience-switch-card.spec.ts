import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AudienceSwitchPreviewView } from '@lfd/pim-contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { AudienceSwitchCard, deactivatedList } from './audience-switch-card';

const BASE = '/channels/b2b';

const PREVIEW: AudienceSwitchPreviewView = {
  publishedUnbound: [{ id: 'prd_1', sku: 'TAR-1', name: 'Tarte' }],
  publishedB2bClosed: [],
  boundUnpublished: [],
  soldWithoutAllergens: [],
  activeIncomplete: [
    {
      id: 'prd_2',
      sku: 'PAI-1',
      name: 'Pain',
      keepsSelling: false,
      gaps: { 'PAI-1-500': ['vat:eatIn', 'allergens'] },
    },
  ],
};

function setup(granted: readonly string[] = ['pim_catalog:write', 'pim_channels:write']): {
  fixture: ComponentFixture<AudienceSwitchCard>;
  http: HttpTestingController;
  el: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [AudienceSwitchCard],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (p: string): boolean => granted.includes(p) } },
      { provide: NotifyService, useValue: { success: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AudienceSwitchCard);
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<AudienceSwitchCard>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function expectOne(http: HttpTestingController, method: string, path: string) {
  return http.expectOne((req) => req.method === method && req.url.endsWith(`${BASE}/${path}`));
}

function button(el: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
}

describe('AudienceSwitchCard', () => {
  it("affiche les comptes de l'aperçu et ce qui manque aux déclinaisons", async () => {
    const { fixture, http, el } = setup();
    expectOne(http, 'GET', 'audience-switch-preview').flush(PREVIEW);
    await settle(fixture);

    expect(el.querySelector('[data-list="publishedUnbound"]')?.textContent).toContain('1');
    const incomplete = el.querySelector('[data-list="activeIncomplete"]')?.textContent ?? '';
    expect(incomplete).toContain('Ne vendra plus rien');
    expect(incomplete).toContain('PAI-1-500 : vat:eatIn, allergens');
  });

  it('affiche le refus du serveur tel quel quand la bascule est refusée', async () => {
    const { fixture, http, el } = setup();
    expectOne(http, 'GET', 'audience-switch-preview').flush(PREVIEW);
    await settle(fixture);

    void fixture.componentInstance.apply();
    expectOne(http, 'POST', 'audience-switch').flush(
      { message: 'La fiche « Baguette » refuse la désactivation.' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    expect(el.textContent).toContain('La fiche « Baguette » refuse la désactivation.');
  });

  it('montre les fiches désactivées puis relit l’aperçu', async () => {
    const { fixture, http, el } = setup();
    expectOne(http, 'GET', 'audience-switch-preview').flush(PREVIEW);
    await settle(fixture);

    void fixture.componentInstance.apply();
    expectOne(http, 'POST', 'audience-switch').flush({
      deactivated: [{ id: 'prd_1', sku: 'TAR-1', name: 'Tarte' }],
      failed: [],
    });
    await settle(fixture);
    expectOne(http, 'GET', 'audience-switch-preview').flush({ ...PREVIEW, publishedUnbound: [] });
    await settle(fixture);

    expect(el.querySelector('[data-result="deactivated"]')?.textContent).toContain('TAR-1');
    expect(button(el, 'Copier la liste')).toBeDefined();
  });

  it('réémet tout, puis une fiche en échec qui sort de la liste', async () => {
    const { fixture, http, el } = setup();
    expectOne(http, 'GET', 'audience-switch-preview').flush(PREVIEW);
    await settle(fixture);
    const card = fixture.componentInstance;

    void card.reemitAll();
    const all = expectOne(http, 'POST', 'reemit');
    expect(all.request.body).toEqual({});
    all.flush({ categories: 2, products: 5, failedProducts: ['prd_9'] });
    await settle(fixture);
    expect(el.querySelector('[data-result="failedProducts"]')).not.toBeNull();
    expect(button(el, 'Réémettre cette fiche')).toBeDefined();

    void card.reemitOne('prd_9');
    const one = expectOne(http, 'POST', 'reemit');
    expect(one.request.body).toEqual({ productId: 'prd_9' });
    one.flush({ categories: 0, products: 1, failedProducts: [] });
    await settle(fixture);
    expect(el.querySelector('[data-result="failedProducts"]')).toBeNull();
  });

  it("masque les gestes sans le droit d'écriture", async () => {
    const { fixture, http, el } = setup(['pim_catalog:read']);
    expectOne(http, 'GET', 'audience-switch-preview').flush(PREVIEW);
    await settle(fixture);

    expect(button(el, "Appliquer la bascule d'audience")).toBeUndefined();
    expect(button(el, 'Réémettre tout')).toBeUndefined();
  });

  it('copie la liste du retour arrière, identifiant en tête', () => {
    expect(
      deactivatedList([
        { id: 'prd_1', sku: 'TAR-1', name: 'Tarte' },
        { id: 'prd_2', sku: 'PAI-1', name: 'Pain' },
      ]),
    ).toBe('prd_1\tTAR-1\tTarte\nprd_2\tPAI-1\tPain');
  });
});
