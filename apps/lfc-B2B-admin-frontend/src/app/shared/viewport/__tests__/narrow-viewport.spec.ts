import { Injectable, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { narrowViewport } from '../narrow-viewport';

/** Un `MediaQueryList` doublé, dont on pilote les changements à la main. */
class FakeQuery {
  matches = false;
  private listeners: ((event: MediaQueryListEvent) => void)[] = [];
  removed = 0;

  addEventListener(_: string, fn: (event: MediaQueryListEvent) => void): void {
    this.listeners.push(fn);
  }

  removeEventListener(): void {
    this.removed += 1;
  }

  emit(matches: boolean): void {
    this.matches = matches;
    for (const fn of this.listeners) {
      fn({ matches } as MediaQueryListEvent);
    }
  }
}

/** Un hôte injectable : `narrowViewport` demande un `DestroyRef`. */
@Injectable()
class Host {
  readonly narrow: Signal<boolean> = narrowViewport();
}

/** Le même, accroché au seuil d'un AUTRE composant. */
@Injectable()
class HostAtShellBreakpoint {
  readonly narrow: Signal<boolean> = narrowViewport(768);
}

/** La dernière requête média demandée, quel que soit l'hôte. */
let asked: string | undefined;

function mount<T = Host>(query: FakeQuery | null, token: new () => T = Host as new () => T): T {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value:
      query === null
        ? undefined
        : vi.fn((media: string) => {
            asked = media;
            return query;
          }),
  });
  TestBed.configureTestingModule({ providers: [Host, HostAtShellBreakpoint] });
  // Résolu AVANT de rendre `matchMedia` — l'hôte l'appelle à la construction.
  const host = TestBed.inject(token);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: original,
  });
  return host;
}

describe('narrowViewport', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    asked = undefined;
  });

  it('interroge le seuil resserré par défaut', () => {
    mount(new FakeQuery());

    expect(asked).toBe('(max-width: 640px)');
  });

  it("interroge le seuil DEMANDÉ quand on s'accroche à un autre composant", () => {
    // Sans cela, un appelant qui passe 768 basculerait quand même à 640 — et
    // la bascule serait muette : le signal répondrait, juste au mauvais pixel.
    mount(new FakeQuery(), HostAtShellBreakpoint);

    expect(asked).toBe('(max-width: 768px)');
  });

  it('part de la largeur RÉELLE, pas du défaut', () => {
    const query = new FakeQuery();
    query.matches = true;

    expect(mount(query).narrow()).toBe(true);
  });

  it('suit les changements en direct', () => {
    // Un quart de tour de téléphone : la valeur lue une fois mentirait aussitôt.
    const query = new FakeQuery();
    const host = mount(query);

    query.emit(true);
    expect(host.narrow()).toBe(true);
    query.emit(false);
    expect(host.narrow()).toBe(false);
  });

  it('répond NON sans matchMedia, plutôt que de jeter', () => {
    // Rendu serveur : le large est le défaut, l'hydratation corrige.
    expect(mount(null).narrow()).toBe(false);
  });

  it("se débranche à la destruction de l'injecteur", () => {
    const query = new FakeQuery();
    mount(query);

    TestBed.resetTestingModule();

    expect(query.removed).toBe(1);
  });
});
