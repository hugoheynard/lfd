import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SuiteEmbed } from '../suite-embed';
import { SUITE_CHANNEL } from '@lfd/suite-embed';

const SHELL_ORIGIN = 'https://shell.example.com';

/** Fabrique une fenêtre « embarquée » (self ≠ top) avec `?suiteHost=`. */
function makeHostedWindow() {
  const messageListeners: Array<(e: MessageEvent) => void> = [];
  const parentPost = vi.fn();
  const win = {
    self: { id: 'self' },
    top: { id: 'top' },
    location: { search: `?suiteHost=${encodeURIComponent(SHELL_ORIGIN)}` },
    parent: { postMessage: parentPost },
    addEventListener: (type: string, cb: (e: MessageEvent) => void) => {
      if (type === 'message') {
        messageListeners.push(cb);
      }
    },
    setTimeout: () => 0,
  };
  const emit = (origin: string, data: unknown) =>
    messageListeners.forEach((cb) => cb({ origin, data } as MessageEvent));
  return { win, parentPost, emit };
}

describe('SuiteEmbed (hosted)', () => {
  let harness: ReturnType<typeof makeHostedWindow>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let routerEvents: Subject<unknown>;
  let embed: SuiteEmbed;

  beforeEach(() => {
    harness = makeHostedWindow();
    navigateByUrl = vi.fn();
    routerEvents = new Subject();
    TestBed.configureTestingModule({
      providers: [
        SuiteEmbed,
        { provide: DOCUMENT, useValue: { defaultView: harness.win } },
        { provide: Router, useValue: { events: routerEvents, navigateByUrl, url: '/produits' } },
      ],
    });
    embed = TestBed.inject(SuiteEmbed);
  });

  it('détecte le mode hosted', () => {
    expect(embed.hosted).toBe(true);
  });

  it('envoie hello vers l’origine du shell à l’init', () => {
    embed.init();
    expect(harness.parentPost).toHaveBeenCalledWith(
      { channel: SUITE_CHANNEL, kind: 'hello' },
      SHELL_ORIGIN,
    );
  });

  it('requestToken résout avec le token du shell (requestId corrélé)', async () => {
    embed.init();
    const promise = embed.requestToken('pim');
    // le token-request a été posté
    expect(harness.parentPost).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'token-request', requestId: 'req-1', audience: 'pim' }),
      SHELL_ORIGIN,
    );
    // le shell répond
    harness.emit(SHELL_ORIGIN, {
      channel: SUITE_CHANNEL,
      kind: 'token',
      requestId: 'req-1',
      token: 'T-42',
    });
    await expect(promise).resolves.toBe('T-42');
  });

  it('ignore un message venant d’une autre origine que le shell', async () => {
    embed.init();
    const promise = embed.requestToken('pim');
    harness.emit('https://evil.example.com', {
      channel: SUITE_CHANNEL,
      kind: 'token',
      requestId: 'req-1',
      token: 'STOLEN',
    });
    // pas résolu par l'imposteur → on vérifie qu'un vrai message passe ensuite
    harness.emit(SHELL_ORIGIN, {
      channel: SUITE_CHANNEL,
      kind: 'token',
      requestId: 'req-1',
      token: 'OK',
    });
    await expect(promise).resolves.toBe('OK');
  });

  it('navigue sur ordre du shell (back/forward)', () => {
    embed.init();
    harness.emit(SHELL_ORIGIN, { channel: SUITE_CHANNEL, kind: 'navigate', path: 'categories' });
    expect(navigateByUrl).toHaveBeenCalledWith('/categories');
  });
});

describe('SuiteEmbed (standalone)', () => {
  beforeEach(() => {
    const win = { self: {}, location: { search: '' }, addEventListener: () => {} };
    // self === top → non hosted
    (win as { top?: unknown }).top = win.self;
    TestBed.configureTestingModule({
      providers: [
        SuiteEmbed,
        { provide: DOCUMENT, useValue: { defaultView: win } },
        { provide: Router, useValue: { events: new Subject(), navigateByUrl: vi.fn(), url: '/' } },
      ],
    });
  });

  it('n’est pas hosted et requestToken rend null', async () => {
    const embed = TestBed.inject(SuiteEmbed);
    expect(embed.hosted).toBe(false);
    await expect(embed.requestToken('pim')).resolves.toBeNull();
  });
});
