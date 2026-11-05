import { signal } from '@angular/core';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { Observable, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { VISITOR } from '../client-context.service';
import { NO_WORKSPACE } from '../no-workspace';
import {
  type ContextKey,
  ContextKeyed,
  ContextKeyedMemory,
  ContextReadAbandoned,
  workspaceHeadersOf,
  workspaceRequestOf,
} from './context-keyed';

/** Un appel par clé, réglé à la main. */
function harness() {
  const shown = signal<string | null>('cmp_a');
  const calls: { key: ContextKey; reply: Subject<string>; cancelled: boolean }[] = [];
  const keyed = new ContextKeyed<string>(
    { prefix: () => shown() },
    (key) =>
      new Observable<string>((subscriber) => {
        const reply = new Subject<string>();
        const call = { key, reply, cancelled: false };
        calls.push(call);
        let answered = false;
        const inner = reply.subscribe({
          next: (value) => {
            answered = true;
            subscriber.next(value);
          },
          error: (error: unknown) => {
            answered = true;
            subscriber.error(error);
          },
        });
        // Quittée avant sa réponse : c'est une annulation.
        return () => {
          call.cancelled = !answered;
          inner.unsubscribe();
        };
      }),
  );
  return { shown, calls, keyed };
}

const A: ContextKey = { workspace: 'cmp_a', own: 'pains' };

describe('ContextKeyed — la lecture rangée par clé de contexte', () => {
  it('compose la clé : même espace, autre part propre = autre lecture', async () => {
    const { calls, keyed } = harness();
    const pains = keyed.read(A);
    const viennoiseries = keyed.read({ workspace: 'cmp_a', own: 'viennoiseries' });
    calls[0]?.reply.next('p');
    calls[1]?.reply.next('v');
    expect([await pains, await viennoiseries]).toEqual(['p', 'v']);
    expect(keyed.held(A)).toBe('p');
    expect(keyed.held({ workspace: 'cmp_b', own: 'pains' })).toBeUndefined();
  });

  it('garde le périmé de la MÊME clé pendant sa relecture', async () => {
    const { calls, keyed } = harness();
    const first = keyed.read(A);
    calls[0]?.reply.next('v1');
    await first;
    const again = keyed.read(A);
    expect(keyed.shown(A)).toBe('v1');
    calls[1]?.reply.next('v2');
    await again;
    expect(keyed.shown(A)).toBe('v2');
  });

  it('ne rend rien pour une autre clé de contexte que celle qui s’affiche', async () => {
    const { shown, calls, keyed } = harness();
    const read = keyed.read(A);
    calls[0]?.reply.next('a');
    await read;
    shown.set('cmp_b');
    expect(keyed.shown(A)).toBeUndefined();
    expect(keyed.held(A)).toBe('a');
  });

  it('la lecture d’avance est rendue une fois, sans second appel', async () => {
    const { calls, keyed } = harness();
    keyed.ahead(A);
    keyed.ahead(A);
    expect(calls).toHaveLength(1);
    calls[0]?.reply.next('d');
    expect(await keyed.read(A)).toBe('d');
    void keyed.read(A);
    expect(calls).toHaveLength(2);
  });

  it('ensure : ni second appel pour une clé en vol ou tenue, et un échec se relit', async () => {
    const { calls, keyed } = harness();
    const first = keyed.ensure(A);
    const twin = keyed.ensure(A);
    expect(calls).toHaveLength(1);
    calls[0]?.reply.next('a');
    expect([await first, await twin]).toEqual(['a', 'a']);
    expect(await keyed.ensure(A)).toBe('a');
    expect(calls).toHaveLength(1);

    const other = { workspace: 'cmp_a', own: 'autre' };
    const failing = keyed.ensure(other);
    calls[1]?.reply.error(new Error('panne'));
    await expect(failing).rejects.toThrow('panne');
    void keyed.ensure(other);
    expect(calls).toHaveLength(3);
  });

  it('ensure reprend la lecture d’avance, une fois', async () => {
    const { calls, keyed } = harness();
    keyed.ahead(A);
    const taken = keyed.ensure(A);
    calls[0]?.reply.next('d');
    expect(await taken).toBe('d');
    void keyed.read(A);
    expect(calls).toHaveLength(2);
  });

  it('coupe une lecture devenue inutile quand son espace est abandonné', async () => {
    const { calls, keyed } = harness();
    keyed.ahead({ workspace: 'cmp_b', own: '' });
    const kept = keyed.read(A);
    keyed.forget('cmp_b');
    expect(calls.map((call) => call.cancelled)).toEqual([true, false]);
    // Jetée : la redemander relit.
    void keyed.read({ workspace: 'cmp_b', own: '' });
    expect(calls).toHaveLength(3);
    calls[1]?.reply.next('a');
    expect(await kept).toBe('a');
  });

  it('la déconnexion vide tout, lectures en vol comprises', async () => {
    const { calls, keyed } = harness();
    const done = keyed.read(A);
    calls[0]?.reply.next('a');
    await done;
    const pending = keyed.read(A);
    const memory = new ContextKeyedMemory();
    memory.register(keyed);
    memory.clear();
    await expect(pending).rejects.toBeInstanceOf(ContextReadAbandoned);
    expect(calls[1]?.cancelled).toBe(true);
    expect(keyed.held(A)).toBeUndefined();
  });

  /**
   * 2026-11-05 : une clé visiteur lue pendant qu'un espace est connu part
   * marquée « sans espace » — l'intercepteur ne la complète pas.
   */
  it('une clé visiteur part sans en-tête et marquée « sans espace »', () => {
    const visitor = workspaceRequestOf({ workspace: VISITOR, own: '' }, { Authorization: 'x' });
    expect(visitor.headers).toEqual({ Authorization: 'x' });
    expect(visitor.context.get(NO_WORKSPACE)).toBe(true);
    const own = workspaceRequestOf(A);
    expect(own.headers).toEqual({ [WORKSPACE_HEADER]: 'cmp_a' });
    expect(own.context.get(NO_WORKSPACE)).toBe(false);
  });

  it('pose l’en-tête d’espace depuis la clé, aucun pour un visiteur', () => {
    expect(workspaceHeadersOf(A)).toEqual({ [WORKSPACE_HEADER]: 'cmp_a' });
    expect(workspaceHeadersOf({ workspace: VISITOR, own: '' })).toEqual({});
  });
});
