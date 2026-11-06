import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { WORKSPACE_RELOAD_ROUTE } from '../client-workspace-switch.service';
import { WorkspaceReload } from './workspace-reload';

/**
 * Régression (2026-11-06, Hugo : « je reste bloqué sur /changement-d-espace ») :
 * l'écran de passage, chargé pour de vrai, restait vide sans issue.
 */
describe('WorkspaceReload — l’écran de passage de la bascule d’espace', () => {
  function mount(pathname: string, platform = 'browser'): ReturnType<typeof vi.fn> {
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DOCUMENT, useValue: { location: { pathname } } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    TestBed.runInInjectionContext(() => new WorkspaceReload());
    return navigateByUrl;
  }

  it('repart vers l’accueil quand la barre d’adresse dit le détour', () => {
    const navigateByUrl = mount(WORKSPACE_RELOAD_ROUTE);
    expect(navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('ne fait rien pendant une bascule : l’adresse reste celle d’où l’on vient', () => {
    expect(mount('/boutique')).not.toHaveBeenCalled();
  });

  it('ne fait rien au rendu serveur', () => {
    expect(mount(WORKSPACE_RELOAD_ROUTE, 'server')).not.toHaveBeenCalled();
  });
});
