import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShopCatalogueView } from '@lfd/contracts';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { sizedMedia, TILE_WIDTHS } from '../media-source';
import { hydrateWith, TEST_CATALOGUE } from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import { FIRST_SCREEN_TILES, SHOP_CHUNK, ShopWarmup } from './shop-warmup';

const [MODEL] = TEST_CATALOGUE.items;
if (MODEL === undefined) {
  throw new Error('La fixture du catalogue est vide.');
}

/** La photo d'une pièce, servie par le fonds — une origine étrangère à la page. */
const photoOf = (index: number): string =>
  `https://media.example.test/products/piece-${String(index)}.jpg`;

/** Dix pièces photographiées : plus que le premier écran. */
const PHOTOGRAPHED: ShopCatalogueView = {
  ...TEST_CATALOGUE,
  items: Array.from({ length: 10 }, (_, index) => ({
    ...MODEL,
    sku: `SKU-${String(index)}`,
    thumbnail: null,
    image: { url: photoOf(index), alt: '', width: null, height: null },
  })),
};

/** Le morceau de la boutique, demandé ou non. */
let loadShop = vi.fn(() => Promise.resolve());

/** Ce que le navigateur aurait fait à l'inactivité, rejoué à la main. */
let idle: (() => void)[] = [];
/** Combien de travaux d'inactivité ont été annulés. */
let cancelled = 0;
/** Les photos demandées, dans l'ordre. */
let requested: string[] = [];

class RecordingImage {
  decoding = '';
  fetchPriority = '';
  set src(value: string) {
    requested.push(value);
  }
}

function setUp(platform: 'browser' | 'server'): { warmup: ShopWarmup; screen: DestroyRef } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: SHOP_CHUNK, useValue: loadShop },
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
      },
      provideWorkspace(workspaceDouble()),
    ],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), PHOTOGRAPHED);
  return { warmup: TestBed.inject(ShopWarmup), screen: TestBed.inject(DestroyRef) };
}

function runIdle(): void {
  TestBed.tick();
  const pending = idle;
  idle = [];
  pending.forEach((work) => work());
}

function setConnection(hints: { saveData?: boolean; effectiveType?: string } | undefined): void {
  Object.defineProperty(navigator, 'connection', { value: hints, configurable: true });
}

function linkCount(): number {
  return document.head.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]').length;
}

describe('ShopWarmup', () => {
  beforeEach(() => {
    idle = [];
    requested = [];
    loadShop = vi.fn(() => Promise.resolve());
    vi.stubGlobal('requestIdleCallback', (work: () => void) => idle.push(work));
    cancelled = 0;
    vi.stubGlobal('cancelIdleCallback', () => {
      cancelled += 1;
    });
    vi.stubGlobal('Image', RecordingImage);
    setConnection(undefined);
    document.head
      .querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]')
      .forEach((link) => link.remove());
  });

  afterEach(() => {
    // L'écran se démonte AVANT qu'on rende au navigateur ses vraies fonctions.
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    setConnection(undefined);
  });

  it('inactif : charge la boutique et demande les photos du premier écran, à la plus petite largeur', () => {
    const { warmup, screen } = setUp('browser');

    warmup.start(screen);
    expect(loadShop).not.toHaveBeenCalled();
    expect(requested).toEqual([]);

    runIdle();

    expect(loadShop).toHaveBeenCalledOnce();
    expect(requested).toEqual(
      Array.from({ length: FIRST_SCREEN_TILES }, (_, index) =>
        sizedMedia(photoOf(index), TILE_WIDTHS[0]),
      ),
    );
    // L'origine des photos, en preconnect + dns-prefetch. L'API ne s'annonce
    // que si sa base est absolue — ce que la configuration de la CI n'est pas
    // (rouge en CI le 2026-10-18, vert en local) : on n'en dépend pas ici.
    const photos = [...document.head.querySelectorAll('link')].filter(
      (link) => link.getAttribute('href') === 'https://media.example.test',
    );
    expect(photos.map((link) => link.rel).sort()).toEqual(['dns-prefetch', 'preconnect']);
  });

  it("quitter Bienvenue avant l'inactivité : rien ne part", () => {
    const { warmup } = setUp('browser');
    const destroyed: (() => void)[] = [];
    const screen: Pick<DestroyRef, 'onDestroy'> = {
      onDestroy: (callback) => {
        destroyed.push(callback);
        return () => undefined;
      },
    };

    warmup.start(screen);
    destroyed.forEach((callback) => callback());
    TestBed.tick();

    expect(idle.length).toBeGreaterThan(0);
    expect(cancelled).toBe(idle.length);
  });

  it('saveData : la boutique se précharge, pas les photos', () => {
    setConnection({ saveData: true });
    const { warmup, screen } = setUp('browser');

    warmup.start(screen);
    runIdle();

    expect(loadShop).toHaveBeenCalledOnce();
    expect(requested).toEqual([]);
  });

  it('2G : pas de photos non plus', () => {
    setConnection({ effectiveType: '2g' });
    const { warmup, screen } = setUp('browser');

    warmup.start(screen);
    runIdle();

    expect(requested).toEqual([]);
  });

  it('rendu serveur : rien du tout', () => {
    const { warmup, screen } = setUp('server');

    warmup.start(screen);
    runIdle();

    expect(loadShop).not.toHaveBeenCalled();
    expect(requested).toEqual([]);
    expect(linkCount()).toBe(0);
  });
});
