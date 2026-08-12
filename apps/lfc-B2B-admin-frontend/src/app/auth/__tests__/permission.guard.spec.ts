import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { permissionGuard } from '../permission.guard';
import { PermissionsStore } from '../permissions.store';

/**
 * Le garde de route **cache**, il ne refuse pas — le mur est côté serveur. Ce
 * qu'il doit faire correctement, c'est ne jamais laisser quelqu'un sur une page
 * vide : refusé, il **redirige** vers la première porte ouverte.
 *
 * Le piège qu'il faut éprouver est la redirection en rond : quelqu'un sans
 * aucun droit ne doit pas rebondir de garde en garde. C'est le cas qui fige un
 * navigateur, et aucun test ne le couvrait.
 */
function guardWith(permissions: readonly StaffPermission[]): Promise<boolean | UrlTree> {
  const store: Pick<PermissionsStore, 'ensureLoaded' | 'can'> = {
    ensureLoaded: (): Promise<void> => Promise.resolve(),
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: PermissionsStore, useValue: store }],
  });
  const injector = TestBed.inject(Injector);
  const guard = permissionGuard('growth:read');
  return runInInjectionContext(injector, () =>
    Promise.resolve(guard(null as never, null as never)),
  ) as Promise<boolean | UrlTree>;
}

/** Le chemin d'un `UrlTree`, ou `null` si le garde a laissé passer. */
function redirectPath(result: boolean | UrlTree): string | null {
  return typeof result === 'boolean' ? null : TestBed.inject(Router).serializeUrl(result);
}

describe('permissionGuard — laisse passer qui a le droit', () => {
  it('accepte la navigation quand la permission est là', async () => {
    const result = await guardWith(['growth:read']);

    expect(result).toBe(true);
  });
});

describe('permissionGuard — redirige plutôt que de bloquer', () => {
  it('renvoie vers la première destination ouverte, dans l\'ordre du menu', async () => {
    // L'ordre compte : `companies` passe avant `orders`, comme dans le menu.
    // Renvoyer ailleurs donnerait l'impression d'avoir cliqué de travers.
    const result = await guardWith(['companies:read', 'orders:read']);

    expect(redirectPath(result)).toBe('/comptes-clients');
  });

  it('descend dans la liste quand les premières portes sont fermées', async () => {
    const result = await guardWith(['settings:read']);

    expect(redirectPath(result)).toBe('/reglages');
  });
});

describe('permissionGuard — le cas qui fige un navigateur', () => {
  it('laisse passer quand AUCUNE porte n\'est ouverte', async () => {
    // Sans ça, chaque redirection retomberait sur un garde qui redirige : le
    // navigateur boucle, et la personne ne voit jamais l'écran qui explique
    // qu'elle n'a aucun périmètre.
    const result = await guardWith([]);

    expect(result).toBe(true);
  });
});
