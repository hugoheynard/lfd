import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { ClientContext, VISITOR } from './client-context.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';

describe('ClientContext — le contexte de lecture', () => {
  const authenticated = signal(false);
  let workspace: WorkspaceDouble;

  function setUp(platform: 'browser' | 'server' = 'browser'): ClientContext {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthFacade, useValue: { isAuthenticated: authenticated } },
        provideWorkspace(workspace),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    return TestBed.inject(ClientContext);
  }

  beforeEach(() => {
    authenticated.set(false);
    workspace = workspaceDouble(null);
  });

  it('sans session, est visiteur, préfixe « visiteur »', () => {
    const context = setUp();
    expect(context.state()).toEqual({ kind: 'visiteur' });
    expect(context.prefix()).toBe(VISITOR);
  });

  it('reconnu avant /me, est inconnu et n’a pas de préfixe', () => {
    authenticated.set(true);
    const context = setUp();
    expect(context.state()).toEqual({ kind: 'inconnu' });
    expect(context.prefix()).toBeNull();
  });

  it('passe d’inconnu à confirmé quand /me donne l’espace', () => {
    authenticated.set(true);
    const context = setUp();
    workspace.current.set('cmp_1');
    expect(context.state()).toEqual({ kind: 'confirmé', workspace: 'cmp_1' });
    expect(context.prefix()).toBe('cmp_1');
    workspace.current.set(PERSONAL_WORKSPACE);
    expect(context.prefix()).toBe(PERSONAL_WORKSPACE);
  });

  it('à la déconnexion, redevient visiteur même si un espace reste en mémoire', () => {
    authenticated.set(true);
    workspace.current.set('cmp_1');
    const context = setUp();
    authenticated.set(false);
    expect(context.prefix()).toBe(VISITOR);
  });

  it('se résout pareil au rendu serveur, sans rien lire du navigateur', () => {
    authenticated.set(true);
    const context = setUp('server');
    expect(context.prefix()).toBeNull();
    workspace.current.set('cmp_1');
    expect(context.state()).toEqual({ kind: 'confirmé', workspace: 'cmp_1' });
  });
});
