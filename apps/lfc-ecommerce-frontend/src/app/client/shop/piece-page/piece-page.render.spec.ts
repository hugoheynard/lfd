import {
  CATALOGUE_TIMEOUT_MS,
  FAILURE_CACHE_CONTROL,
  FOUND_CACHE_CONTROL,
  MISSING_CACHE_CONTROL,
  onRequestGet,
} from '../../../../../functions/boutique/article/[sku]';
import { escapeHtml, findPublicPiece, renderPieceHead } from './piece-page.render';

const ORIGIN = 'https://boutique.example';

const INDEX_HTML =
  '<!doctype html><html><head>\n    <title>La Folie Coffee — B2B</title>\n  </head><body><app-root></app-root></body></html>';

function item(sku: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    sku,
    name: 'Pain au levain',
    note: 'Croûte épaisse',
    image: { url: '/media/levain.jpg', alt: '', width: null, height: null },
    audience: 'public',
    ...overrides,
  };
}

function catalogue(...items: readonly unknown[]) {
  return { shelves: [], items, operations: [] };
}

/** Un `fetch` doublé à la main : il rend ce qu'on lui donne et note l'URL appelée. */
class FakeApi {
  readonly calls: string[] = [];
  constructor(private readonly answer: (url: string) => Promise<Response>) {}
  readonly fetch = (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    this.calls.push(url);
    return this.answer(url);
  };
}

const realFetch = globalThis.fetch;

function useApi(api: FakeApi): void {
  globalThis.fetch = api.fetch;
}

function context(path: string) {
  return {
    request: new Request(`${ORIGIN}${path}`),
    env: {
      ASSETS: {
        fetch: (): Promise<Response> => Promise.resolve(new Response(INDEX_HTML, { status: 200 })),
      },
    },
  };
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GET /boutique/article/<sku>', () => {
  it('article public : 200, titre remplacé et balises injectées dans le <head>', async () => {
    useApi(new FakeApi(() => json(catalogue(item('PAIN-1')))));

    const response = await onRequestGet(context('/boutique/article/PAIN-1'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(FOUND_CACHE_CONTROL);
    expect(html).toContain('<title>Pain au levain — La Folie Coffee</title>');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain('<meta name="description" content="Croûte épaisse" />');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/boutique/article/PAIN-1" />`);
    expect(html).toContain('<meta property="og:type" content="product" />');
    expect(html).toContain(
      `<meta property="og:url" content="${ORIGIN}/boutique/article/PAIN-1" />`,
    );
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/media/levain.jpg" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('</head>'));
    expect(html).not.toContain('noindex');
  });

  it('échappe le nom et la note : aucune balise ne sort du texte saisi', async () => {
    useApi(
      new FakeApi(() =>
        json(catalogue(item('X', { name: '"><script>alert(1)</script> $& Cie', note: null }))),
      ),
    );

    const html = await (await onRequestGet(context('/boutique/article/X'))).text();

    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '<title>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; $&amp; Cie — La Folie Coffee</title>',
    );
    // Sans note, la description reprend le nom — échappé lui aussi.
    expect(html).toContain(
      `<meta name="description" content="${escapeHtml('"><script>alert(1)</script> $& Cie')}" />`,
    );
  });

  it('article inconnu : 404, noindex, aucune balise de fiche', async () => {
    useApi(new FakeApi(() => json(catalogue(item('AUTRE')))));

    const response = await onRequestGet(context('/boutique/article/INCONNU'));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe(MISSING_CACHE_CONTROL);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('og:title');
  });

  it("article réservé aux pros : traité comme absent, rien de lui dans l'en-tête", async () => {
    useApi(
      new FakeApi(() => json(catalogue(item('PRO-1', { audience: 'pro', name: 'Secret pro' })))),
    );

    const response = await onRequestGet(context('/boutique/article/PRO-1'));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).not.toContain('Secret pro');
  });

  it('lit le catalogue public anonyme, sans audience', async () => {
    const api = new FakeApi(() => json(catalogue()));
    useApi(api);

    await onRequestGet(context('/boutique/article/A?audience=pro'));

    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatch(/\/shop\/catalogue$/);
  });

  it("API en 500 : l'index.html intact, en 200, non mis en cache", async () => {
    useApi(new FakeApi(() => Promise.resolve(new Response('', { status: 500 }))));

    const response = await onRequestGet(context('/boutique/article/PAIN-1'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(FAILURE_CACHE_CONTROL);
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it("API injoignable ou trop lente : l'index.html intact, en 200", async () => {
    useApi(new FakeApi(() => Promise.reject(new DOMException('délai', 'TimeoutError'))));

    const response = await onRequestGet(context('/boutique/article/PAIN-1'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX_HTML);
    expect(CATALOGUE_TIMEOUT_MS).toBeLessThanOrEqual(1500);
  });

  it('sku encodé dans le chemin : décodé une fois, et réencodé dans la canonique', async () => {
    useApi(new FakeApi(() => json(catalogue(item('CAFÉ 1/2', { name: 'Café' })))));

    const response = await onRequestGet(context('/boutique/article/CAF%C3%89%201%2F2'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      `<link rel="canonical" href="${ORIGIN}/boutique/article/CAF%C3%89%201%2F2" />`,
    );
  });

  it('sku mal encodé : 404 sans appeler la vitrine', async () => {
    const api = new FakeApi(() => json(catalogue()));
    useApi(api);

    const response = await onRequestGet(context('/boutique/article/%E0%A4%A'));

    expect(response.status).toBe(404);
    expect(api.calls).toHaveLength(0);
  });
});

describe('findPublicPiece / renderPieceHead', () => {
  it('une réponse illisible ne trouve rien', () => {
    expect(findPublicPiece(null, 'A')).toBeNull();
    expect(findPublicPiece({ items: 'non' }, 'A')).toBeNull();
  });

  it('sans visuel : ni og:image, carte twitter simple', () => {
    const html = renderPieceHead(
      INDEX_HTML,
      { sku: 'A', name: 'A', note: null, imageUrl: null },
      ORIGIN,
    );
    expect(html).not.toContain('og:image');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
  });
});
