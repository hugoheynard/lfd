import type { ShopifyOAuthCredentials } from '../../../../infra/config/app-config.js';
import { ShopifyNotConfiguredError, ShopifyTransportError } from '../errors.js';
import {
  type ShopifyCredentialsSource,
  ShopifyTokenProvider,
} from '../token-provider.js';

/** Fake du port étroit — aucun accès à l'environnement, tout est explicite. */
function source(options: {
  token?: string;
  credentials?: ShopifyOAuthCredentials;
}): ShopifyCredentialsSource {
  return {
    shopifyAdminToken: () => options.token ?? null,
    shopifyOAuthCredentials: () => options.credentials ?? null,
  };
}

interface FetchCall {
  readonly input: Parameters<typeof fetch>[0];
  readonly init: Parameters<typeof fetch>[1];
}

/**
 * Stub de `fetch` fait main (le repo n'utilise aucun helper `jest.*`) : une file de
 * réponses/échecs à jouer dans l'ordre, et la capture des appels pour les assertions.
 */
class FetchStub {
  readonly calls: FetchCall[] = [];
  private readonly queue: Array<Response | Error> = [];

  enqueue(...outcomes: Array<Response | Error>): void {
    this.queue.push(...outcomes);
  }

  readonly fetch = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    this.calls.push({ input, init });
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(
        new Error('Aucune réponse en file pour cet appel.'),
      );
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
}

const CREDS: ShopifyOAuthCredentials = { clientId: 'cid', clientSecret: 'sec' };
const DOMAIN = 'chevallot.myshopify.com';

function grant(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('ShopifyTokenProvider', () => {
  const realFetch = globalThis.fetch;
  let stub: FetchStub;

  beforeEach(() => {
    stub = new FetchStub();
    globalThis.fetch = stub.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('rend le jeton statique legacy tel quel, sans aucun échange', async () => {
    const provider = new ShopifyTokenProvider(
      source({ token: 'shpat_legacy' }),
    );

    const token = await provider.accessTokenFor(DOMAIN);

    expect(token).toBe('shpat_legacy');
    expect(stub.calls).toHaveLength(0);
  });

  it('refuse sans aucun identifiant approvisionné', async () => {
    const provider = new ShopifyTokenProvider(source({}));

    await expect(provider.accessTokenFor(DOMAIN)).rejects.toBeInstanceOf(
      ShopifyNotConfiguredError,
    );
    expect(stub.calls).toHaveLength(0);
  });

  it('échange les client credentials et cible le bon endpoint', async () => {
    stub.enqueue(grant({ access_token: 'shpat_fresh', expires_in: 86399 }));
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    const token = await provider.accessTokenFor(DOMAIN);

    expect(token).toBe('shpat_fresh');
    expect(stub.calls).toHaveLength(1);
    const call = stub.calls[0];
    expect(call?.input).toBe(`https://${DOMAIN}/admin/oauth/access_token`);
    expect(call?.init?.method).toBe('POST');
    const body = call?.init?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    const sent = body instanceof URLSearchParams ? body.toString() : '';
    expect(sent).toContain('grant_type=client_credentials');
    expect(sent).toContain('client_id=cid');
    expect(sent).toContain('client_secret=sec');
  });

  it('réutilise le jeton en cache pour la même boutique (un seul échange)', async () => {
    stub.enqueue(grant({ access_token: 'shpat_cached', expires_in: 86399 }));
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    await provider.accessTokenFor(DOMAIN);
    const second = await provider.accessTokenFor(DOMAIN);

    expect(second).toBe('shpat_cached');
    expect(stub.calls).toHaveLength(1);
  });

  it('ré-échange quand la boutique cible change', async () => {
    stub.enqueue(
      grant({ access_token: 'a', expires_in: 86399 }),
      grant({ access_token: 'b', expires_in: 86399 }),
    );
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    const first = await provider.accessTokenFor('one.myshopify.com');
    const second = await provider.accessTokenFor('two.myshopify.com');

    expect(first).toBe('a');
    expect(second).toBe('b');
    expect(stub.calls).toHaveLength(2);
  });

  it('remonte une erreur transport quand le grant est refusé', async () => {
    stub.enqueue(grant({ error: 'invalid_client' }, 401));
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    await expect(provider.accessTokenFor(DOMAIN)).rejects.toBeInstanceOf(
      ShopifyTransportError,
    );
  });

  it('remonte une erreur transport quand la réponse est sans access_token', async () => {
    stub.enqueue(grant({ expires_in: 86399 }));
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    await expect(provider.accessTokenFor(DOMAIN)).rejects.toBeInstanceOf(
      ShopifyTransportError,
    );
  });

  it('enrobe un échec réseau en erreur transport', async () => {
    stub.enqueue(new Error('ECONNREFUSED'));
    const provider = new ShopifyTokenProvider(source({ credentials: CREDS }));

    await expect(provider.accessTokenFor(DOMAIN)).rejects.toBeInstanceOf(
      ShopifyTransportError,
    );
  });
});
