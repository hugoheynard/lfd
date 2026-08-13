import {
  CLIENT_IP_HEADER,
  guardedFetch,
  trustedClientIp,
  withTrustedClientIp,
} from '../edge-guard';
import type { RateLimiter } from '../edge-guard';

/**
 * Ce fichier existe pour empêcher UNE régression précise, et il faut la nommer
 * pour qu'on ne le supprime pas un jour en le prenant pour de la paperasse.
 *
 * Le throttler du backend clé sur `x-lfc-client-ip`. Jusqu'au 2026-08-13, cet
 * en-tête arrivait tel que le client l'avait écrit : personne ne l'écrasait,
 * malgré un commentaire affirmant le contraire. Conséquence mesurée en
 * production sur `/platform-settings` (60/min), 75 requêtes : en-tête FIXE → 15
 * rejets ; en-tête TOURNANT → **zéro**. Il suffisait d'incrémenter un en-tête
 * pour n'être jamais limité.
 *
 * Les tests ci-dessous échouent si l'on :
 *   - relit `x-lfc-client-ip` comme source d'identité,
 *   - oublie de le réécrire ou de le supprimer,
 *   - transmet la requête ORIGINALE au container au lieu de la réécrite.
 *
 * Ce dernier point est la raison d'être de l'injection de `forward` : sans elle,
 * un retour à `backend(env).fetch(request)` laisserait tous les autres tests au
 * vert.
 */

const ALWAYS_ALLOWS: RateLimiter = {
  limit: () => Promise.resolve({ success: true }),
};
const ALWAYS_REFUSES: RateLimiter = {
  limit: () => Promise.resolve({ success: false }),
};

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://api.test/platform-settings', { headers });
}

describe("trustedClientIp — l'identité ne vient QUE de Cloudflare", () => {
  it('lit cf-connecting-ip', () => {
    expect(
      trustedClientIp(requestWith({ 'cf-connecting-ip': '9.9.9.9' })),
    ).toBe('9.9.9.9');
  });

  it("ignore x-lfc-client-ip, même seul — c'est une valeur cliente", () => {
    expect(
      trustedClientIp(requestWith({ [CLIENT_IP_HEADER]: '1.2.3.4' })),
    ).toBeNull();
  });

  it('ignore x-lfc-client-ip même quand cf-connecting-ip est présent', () => {
    const request = requestWith({
      [CLIENT_IP_HEADER]: '1.2.3.4',
      'cf-connecting-ip': '9.9.9.9',
    });
    expect(trustedClientIp(request)).toBe('9.9.9.9');
  });

  it('rend null sans en-tête (appel interne : on ne limite pas)', () => {
    expect(trustedClientIp(requestWith({}))).toBeNull();
  });
});

describe('withTrustedClientIp — ce que le container reçoit', () => {
  it('écrase la valeur forgée par le client', () => {
    const request = requestWith({
      [CLIENT_IP_HEADER]: '1.2.3.4',
      'cf-connecting-ip': '9.9.9.9',
    });
    expect(withTrustedClientIp(request).headers.get(CLIENT_IP_HEADER)).toBe(
      '9.9.9.9',
    );
  });

  it("le pose quand le client n'en envoyait pas", () => {
    const request = requestWith({ 'cf-connecting-ip': '9.9.9.9' });
    expect(withTrustedClientIp(request).headers.get(CLIENT_IP_HEADER)).toBe(
      '9.9.9.9',
    );
  });

  it("le SUPPRIME faute d'IP de confiance, au lieu de laisser passer la valeur cliente", () => {
    const request = requestWith({ [CLIENT_IP_HEADER]: '1.2.3.4' });
    expect(
      withTrustedClientIp(request).headers.get(CLIENT_IP_HEADER),
    ).toBeNull();
  });

  it('laisse le reste de la requête intact', () => {
    const request = new Request('https://api.test/orders', {
      method: 'POST',
      headers: { authorization: 'Bearer jeton', 'cf-connecting-ip': '9.9.9.9' },
    });
    const forwarded = withTrustedClientIp(request);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.url).toBe('https://api.test/orders');
    expect(forwarded.headers.get('authorization')).toBe('Bearer jeton');
  });
});

describe('guardedFetch — le câblage, pas seulement le helper', () => {
  it("ne transmet JAMAIS la valeur d'en-tête fournie par le client", async () => {
    const seen: Request[] = [];
    const request = requestWith({
      [CLIENT_IP_HEADER]: '1.2.3.4',
      'cf-connecting-ip': '9.9.9.9',
    });

    await guardedFetch(request, ALWAYS_ALLOWS, (forwarded) => {
      seen.push(forwarded);
      return Promise.resolve(new Response('ok'));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.get(CLIENT_IP_HEADER)).toBe('9.9.9.9');
  });

  it("clé le limiteur sur l'IP Cloudflare, pas sur l'en-tête client", async () => {
    const keys: string[] = [];
    const limiter: RateLimiter = {
      limit: ({ key }) => {
        keys.push(key);
        return Promise.resolve({ success: true });
      },
    };
    const request = requestWith({
      [CLIENT_IP_HEADER]: '1.2.3.4',
      'cf-connecting-ip': '9.9.9.9',
    });

    await guardedFetch(request, limiter, () =>
      Promise.resolve(new Response('ok')),
    );

    expect(keys).toEqual(['9.9.9.9']);
  });

  it('répond 429 sans atteindre le container quand le quota est dépassé', async () => {
    let forwarded = false;
    const request = requestWith({ 'cf-connecting-ip': '9.9.9.9' });

    const response = await guardedFetch(request, ALWAYS_REFUSES, () => {
      forwarded = true;
      return Promise.resolve(new Response('ok'));
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(forwarded).toBe(false);
  });

  it("ne limite pas un appel interne (pas d'IP), mais nettoie quand même l'en-tête", async () => {
    const seen: Request[] = [];
    let limited = false;
    const limiter: RateLimiter = {
      limit: () => {
        limited = true;
        return Promise.resolve({ success: false });
      },
    };

    await guardedFetch(
      requestWith({ [CLIENT_IP_HEADER]: '1.2.3.4' }),
      limiter,
      (forwarded) => {
        seen.push(forwarded);
        return Promise.resolve(new Response('ok'));
      },
    );

    expect(limited).toBe(false);
    expect(seen[0]?.headers.get(CLIENT_IP_HEADER)).toBeNull();
  });
});
