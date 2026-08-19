import { entryScriptOf, FrontendProbe, type HttpGet } from "../frontend.probe.js";

const ORIGIN = "https://lfc-b2b-eu7.pages.dev";

/** Un shell Angular tel que Pages le rend, empreinte de build comprise. */
const SHELL = `<!doctype html><html><head>
  <script src="https://cdn.tiers.example/mesure.js"></script>
  <script src="main-A1B2C3.js" type="module"></script>
</head><body><app-root></app-root></body></html>`;

function html(body: string, status = 200, type = "text/html; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "content-type": type } });
}

/** Un transport piloté par URL, qui retient ce qui a été demandé. */
function serve(routes: Record<string, () => Response>): { http: HttpGet; calls: string[] } {
  const calls: string[] = [];
  const http: HttpGet = (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) {
      return Promise.reject(new Error("hôte inconnu"));
    }
    return Promise.resolve(route());
  };
  return { http, calls };
}

describe("FrontendProbe — servi, pas « en marche »", () => {
  it("déclare le front SERVI quand le shell ET son point d'entrée répondent", async () => {
    const { http, calls } = serve({
      [ORIGIN]: () => html(SHELL),
      [`${ORIGIN}/main-A1B2C3.js`]: () => new Response("", { status: 206 }),
    });

    const outcome = await new FrontendProbe("b2b-front", ORIGIN, http).check();

    expect(outcome.verdict).toBe("up");
    // Deux temps, dans cet ordre : le second est déduit du premier, jamais écrit
    // en dur — c'est ce qui fait qu'un nouveau hash de build ne casse rien.
    expect(calls).toEqual([ORIGIN, `${ORIGIN}/main-A1B2C3.js`]);
  });

  it("🔴 refuse de croire un `200` dont le point d'entrée est absent", async () => {
    // LA raison d'être de cette sonde. Cloudflare sert le shell même quand le
    // build est cassé : page blanche chez le client, carte verte chez nous. Un
    // seul appel sur la racine aurait dit « up » ici.
    const { http } = serve({
      [ORIGIN]: () => html(SHELL),
      [`${ORIGIN}/main-A1B2C3.js`]: () => new Response("", { status: 404 }),
    });

    const outcome = await new FrontendProbe("b2b-front", ORIGIN, http).check();

    expect(outcome.verdict).toBe("down");
    expect(outcome.detail).toContain("main-A1B2C3.js");
  });

  it("refuse une racine servie autrement qu'en HTML", async () => {
    const { http } = serve({ [ORIGIN]: () => html("{}", 200, "application/json") });

    const outcome = await new FrontendProbe("b2b-front", ORIGIN, http).check();

    expect(outcome.verdict).toBe("down");
    expect(outcome.detail).toContain("pas en HTML");
  });

  it("rend `down` — jamais une exception — quand l'hôte est injoignable", async () => {
    const { http } = serve({});

    // Une sonde qui jette ferait tomber toute la carte avec elle.
    await expect(new FrontendProbe("b2b-front", ORIGIN, http).check()).resolves.toMatchObject({
      verdict: "down",
      detail: "injoignable",
    });
  });
});

describe("entryScriptOf — le point d'entrée, et pas celui du voisin", () => {
  it("ignore les scripts tiers et retient le premier de même origine", () => {
    // La panne d'une balise de mesure n'est pas la nôtre : la compter comme
    // telle rendrait la carte rouge pour le compte d'autrui.
    expect(entryScriptOf(SHELL, ORIGIN)).toBe(`${ORIGIN}/main-A1B2C3.js`);
  });

  it("rend `undefined` quand la page ne référence aucun script à nous", () => {
    expect(entryScriptOf("<html><body>bonjour</body></html>", ORIGIN)).toBeUndefined();
  });
});
