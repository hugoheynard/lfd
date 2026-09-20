import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ShopifyChannelApi, type VerifyResult } from '../../channels/shopify-channel-api';
import type { ShopifySettings } from '../../data/models';
import { ShopifyIntegration } from './shopify-integration';

function settings(over: Partial<ShopifySettings> = {}): ShopifySettings {
  return {
    shopDomain: '',
    apiVersion: '2026-07',
    isEnabled: false,
    hasToken: false,
    mode: 'dry-run',
    updatedAt: null,
    ...over,
  };
}

/** Fake du canal — pas de HTTP, réponses explicites. */
class FakeChannelApi {
  constructor(
    private readonly view: ShopifySettings,
    private readonly verifyResult: VerifyResult,
  ) {}

  getSettings(): Promise<ShopifySettings> {
    return Promise.resolve(this.view);
  }

  saveSettings(): Promise<ShopifySettings> {
    return Promise.resolve(this.view);
  }

  verify(): Promise<VerifyResult> {
    return Promise.resolve(this.verifyResult);
  }
}

async function render(
  view: ShopifySettings,
  verifyResult: VerifyResult,
): Promise<ComponentFixture<ShopifyIntegration>> {
  TestBed.configureTestingModule({
    providers: [{ provide: ShopifyChannelApi, useValue: new FakeChannelApi(view, verifyResult) }],
  });
  const fixture = TestBed.createComponent(ShopifyIntegration);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function textOf(fixture: ComponentFixture<ShopifyIntegration>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const DRY_RUN_VERIFY: VerifyResult = {
  mode: 'dry-run',
  connected: false,
  shopName: null,
  detail: 'Mode simulation.',
};

describe('ShopifyIntegration', () => {
  it('affiche le hero en simulation quand aucun identifiant', async () => {
    const fixture = await render(settings(), DRY_RUN_VERIFY);
    const text = textOf(fixture);
    expect(text).toContain('Shopify');
    expect(text).toContain('Simulation');
    expect(text).toContain('absente');
    expect(text).toContain('client credentials');
  });

  it('bascule le hero sur le nom de la boutique une fois vérifié connecté', async () => {
    const fixture = await render(
      settings({
        shopDomain: '1kkhae-8q.myshopify.com',
        isEnabled: true,
        hasToken: true,
        mode: 'live',
      }),
      {
        mode: 'live',
        connected: true,
        shopName: 'Ma boutique',
        detail: 'Connecté à Ma boutique.',
      },
    );

    // Avant vérification : marque + identifiants configurés.
    expect(textOf(fixture)).toContain('configurée');

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.hero-actions button',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = textOf(fixture);
    expect(text).toContain('Ma boutique');
    expect(text).toContain('Connecté');
  });
});
