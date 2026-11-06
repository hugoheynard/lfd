import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEW_VERSION, provideNewVersionWatch } from '@lfd/front-ops';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

@Component({ selector: 'app-blank', template: '' })
class Blank {}

/**
 * La veille de `@lfd/front-ops` sous un vrai routeur : une version neuve se
 * prend à la navigation suivante, APRÈS les gardes (2026-11-06). Le paquet ne
 * teste que ses décisions pures (son jest tourne sans navigateur) ; le
 * branchement sur les événements du routeur s'éprouve ici.
 */
describe('provideNewVersionWatch — la bascule après les gardes', () => {
  let served = 'build-a';
  let leaveAllowed = true;
  const assign = vi.fn();

  beforeEach(() => {
    served = 'build-a';
    leaveAllowed = true;
    assign.mockReset();
    sessionStorage.clear();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'lfd-build');
    meta.setAttribute('content', 'build-a');
    document.head.appendChild(meta);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    vi.stubGlobal('location', { ...window.location, assign });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ build: served }) })),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'form', component: Blank, canDeactivate: [() => leaveAllowed] },
          { path: 'list', component: Blank },
          { path: 'detour', component: Blank },
        ]),
        provideNewVersionWatch(),
      ],
    });
  });

  afterEach(() => {
    document.head.querySelector('meta[name="lfd-build"]')?.remove();
    vi.unstubAllGlobals();
  });

  /** Ouvre `/form` sur la version de l'onglet, puis apprend qu'une autre est servie. */
  async function learnNewVersion(): Promise<Router> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/form');
    served = 'build-b';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(TestBed.inject(NEW_VERSION)()).toBe(true));
    return router;
  }

  it('même version : la navigation reste interne', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/form');
    document.dispatchEvent(new Event('visibilitychange'));
    await router.navigateByUrl('/list');
    expect(TestBed.inject(NEW_VERSION)()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('version neuve : la navigation suivante charge l’adresse visée en entier', async () => {
    const router = await learnNewVersion();
    await router.navigateByUrl('/list');
    expect(assign).toHaveBeenCalledExactlyOnceWith('/list');
  });

  it('un formulaire non enregistré refuse : rien ne se recharge', async () => {
    const router = await learnNewVersion();
    leaveAllowed = false;
    expect(await router.navigateByUrl('/list')).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('une navigation qui ne touche pas l’adresse ne recharge pas', async () => {
    const router = await learnNewVersion();
    await router.navigateByUrl('/detour', { skipLocationChange: true });
    expect(assign).not.toHaveBeenCalled();
  });

  it('une lecture en échec ne dit rien', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/form');
    document.dispatchEvent(new Event('visibilitychange'));
    await router.navigateByUrl('/list');
    expect(TestBed.inject(NEW_VERSION)()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
