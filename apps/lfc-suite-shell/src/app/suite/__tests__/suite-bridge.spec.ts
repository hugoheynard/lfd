import { DOCUMENT, Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { SuiteBridge } from '../suite-bridge';
import { SUITE_CHANNEL } from '../embed-protocol';

/** Origine de PIM — les tests tournent en config `development` (suite-config.dev.ts). */
const PIM_ORIGIN = 'http://localhost:7315';
const EVIL_ORIGIN = 'https://evil.example.com';

function fakeFrame(): { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SuiteBridge', () => {
  let bridge: SuiteBridge;
  let replaceState: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;
  let authed = true;
  // Fenêtre factice : capture le handler `message` (jsdom MessageEvent ne
  // remplit pas origin/source depuis le dict, on invoque donc le handler direct).
  let messageHandler: ((e: MessageEvent) => void) | undefined;

  function dispatch(origin: string, source: unknown, data: unknown): void {
    messageHandler?.({ origin, source, data } as MessageEvent);
  }

  beforeEach(() => {
    replaceState = vi.fn();
    getToken = vi.fn().mockResolvedValue('tok-123');
    authed = true;
    messageHandler = undefined;
    const fakeWin = {
      addEventListener: (type: string, cb: (e: MessageEvent) => void) => {
        if (type === 'message') {
          messageHandler = cb;
        }
      },
    };
    TestBed.configureTestingModule({
      providers: [
        SuiteBridge,
        { provide: DOCUMENT, useValue: { defaultView: fakeWin } },
        { provide: Location, useValue: { replaceState } },
        { provide: AuthFacade, useValue: { isAuthenticated: () => authed, getToken } },
      ],
    });
    bridge = TestBed.inject(SuiteBridge);
    bridge.start();
  });

  it('ignore un message d’une origine hors allowlist', async () => {
    const frame = fakeFrame();
    dispatch(EVIL_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: 'token-request',
      requestId: 'r1',
      audience: 'pim',
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it('ignore un message qui n’est pas au protocole', async () => {
    const frame = fakeFrame();
    dispatch(PIM_ORIGIN, frame, { hello: true });
    await flush();
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it('relaie un token pour une origine + audience connues, en ciblant l’origine', async () => {
    const frame = fakeFrame();
    dispatch(PIM_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: 'token-request',
      requestId: 'r1',
      audience: 'pim',
    });
    await flush();
    expect(getToken).toHaveBeenCalledWith('pim');
    expect(frame.postMessage).toHaveBeenCalledWith(
      { channel: SUITE_CHANNEL, kind: 'token', requestId: 'r1', token: 'tok-123' },
      PIM_ORIGIN,
    );
  });

  it('rend token=null pour une audience inconnue', async () => {
    const frame = fakeFrame();
    dispatch(PIM_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: 'token-request',
      requestId: 'r2',
      audience: 'inconnue',
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'token', token: null }),
      PIM_ORIGIN,
    );
  });

  it('rend token=null si non authentifié', async () => {
    authed = false;
    const frame = fakeFrame();
    dispatch(PIM_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: 'token-request',
      requestId: 'r3',
      audience: 'pim',
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ token: null }),
      PIM_ORIGIN,
    );
  });

  it('reflète la route interne dans l’URL parent', async () => {
    dispatch(PIM_ORIGIN, fakeFrame(), { channel: SUITE_CHANNEL, kind: 'route', path: 'produits/42' });
    await flush();
    expect(replaceState).toHaveBeenCalledWith('/pim/produits/42');
  });

  it('notifyNavigate poste vers la frame établie (après hello)', async () => {
    const frame = fakeFrame();
    dispatch(PIM_ORIGIN, frame, { channel: SUITE_CHANNEL, kind: 'hello' });
    await flush();
    bridge.notifyNavigate('pim', 'categories');
    expect(frame.postMessage).toHaveBeenCalledWith(
      { channel: SUITE_CHANNEL, kind: 'navigate', path: 'categories' },
      PIM_ORIGIN,
    );
  });

  it('notifyNavigate est un no-op si la frame est inconnue', () => {
    expect(() => bridge.notifyNavigate('pim', 'x')).not.toThrow();
  });
});
