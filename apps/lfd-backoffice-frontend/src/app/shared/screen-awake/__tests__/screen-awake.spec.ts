import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keepScreenAwake } from '../screen-awake';

/** Un faux verrou : il compte les demandes et sait être relâché par le navigateur. */
class FakeSentinel extends EventTarget {
  released = false;
  async release(): Promise<void> {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

function installWakeLock(behaviour: 'grant' | 'refuse'): FakeSentinel[] {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    if (behaviour === 'refuse') {
      throw new DOMException('refusé', 'NotAllowedError');
    }
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return sentinels;
}

@Component({ selector: 'app-awake-host', template: '' })
class Host {
  readonly held = keepScreenAwake();
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('garder l’écran allumé', () => {
  it('tient le verrou tant que l’écran est ouvert, et le rend à sa destruction', async () => {
    const sentinels = installWakeLock('grant');
    const fixture = TestBed.createComponent(Host);
    await flush();

    expect(fixture.componentInstance.held()).toBe(true);
    fixture.destroy();
    expect(sentinels[0]?.released).toBe(true);
  });

  it('redemande le verrou quand l’onglet revient au premier plan', async () => {
    const sentinels = installWakeLock('grant');
    const fixture = TestBed.createComponent(Host);
    await flush();
    await sentinels[0]?.release();
    expect(fixture.componentInstance.held()).toBe(false);

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(sentinels).toHaveLength(2);
    expect(fixture.componentInstance.held()).toBe(true);
  });

  it('sans l’API, rien n’échoue et le signal dit non', () => {
    const fixture = TestBed.createComponent(Host);
    expect(fixture.componentInstance.held()).toBe(false);
  });

  it('un refus du navigateur laisse la veille normale, sans erreur', async () => {
    installWakeLock('refuse');
    const fixture = TestBed.createComponent(Host);
    await flush();
    expect(fixture.componentInstance.held()).toBe(false);
  });
});
