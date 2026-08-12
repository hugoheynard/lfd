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

function mount(query: FakeQuery | null): Host {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: query === null ? undefined : vi.fn().mockReturnValue(query),
  });
  TestBed.configureTestingModule({ providers: [Host] });
  const host = TestBed.inject(Host);
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
