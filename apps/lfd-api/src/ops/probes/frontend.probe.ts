import { NodeProbe, PROBE_TIMEOUT_MS, type ProbeOutcome } from "./probe.port.js";

/**
 * **Un front servi** — sonde en deux temps sur une Page statique.
 *
 * ## Pourquoi deux temps, et pas un `200` sur la racine
 *
 * Un `200` sur `index.html` est le vert qui ment. Cloudflare sert le shell HTML
 * même quand le build est cassé : bundle absent, mauvais projet Pages,
 * `base-href` faux. Page blanche chez le client, carte verte chez nous — et le
 * soupçon part alors chercher un incident ailleurs, ce qui coûte plus cher que
 * de n'avoir rien affiché du tout.
 *
 * On vérifie donc que le shell existe **et** que son point d'entrée existe :
 *
 * 1. la racine rend `200` avec un `content-type` HTML ;
 * 2. le premier `<script src>` de MÊME ORIGINE qu'elle référence répond.
 *
 * Aucun nom de bundle n'est écrit ici : il est lu dans le HTML rendu, donc la
 * sonde suit les empreintes de build toute seule. C'est ce qui la rend tenable —
 * une sonde qu'un déploiement normal fait rougir est une sonde qu'on éteint.
 *
 * ## Ce qu'elle ne dit pas, et qu'on ne lui fera pas dire
 *
 * Que l'application **démarre**. Un runtime qui explose au boot passe cette
 * sonde. C'est pour ça que la raison rendue est `deploy-ok` et non `up` : un
 * front n'est pas « en marche », il est « servi ». Le seul témoin honnête de
 * « ça marche » viendrait du navigateur du client, et il n'existe pas encore.
 */
/** Ce que la sonde demande à son transport, et rien de plus. */
export type HttpGet = (url: string, init?: RequestInit) => Promise<Response>;

export class FrontendProbe extends NodeProbe {
  constructor(
    readonly id: string,
    private readonly origin: string,
    /**
     * Le transport, injecté plutôt que pris dans l'ambiant. C'est ce qui rend
     * cette sonde testable sans toucher au `fetch` global — donc sans laisser
     * un test en réparer un autre par ordre d'exécution.
     */
    private readonly http: HttpGet = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async check(): Promise<ProbeOutcome> {
    const startedAt = Date.now();
    try {
      const page = await this.http(this.origin, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      if (!page.ok) {
        return failed(startedAt, `la page rend ${page.status}`);
      }
      const type = page.headers.get("content-type") ?? "";
      if (!type.includes("text/html")) {
        return failed(startedAt, `servi en « ${type === "" ? "type absent" : type} », pas en HTML`);
      }
      const entry = entryScriptOf(await page.text(), this.origin);
      if (entry === undefined) {
        return failed(startedAt, "aucun script d'entrée dans la page");
      }
      return await this.checkEntry(entry, startedAt);
    } catch {
      return failed(startedAt, "injoignable");
    }
  }

  /**
   * Le point d'entrée, demandé **en un octet** (`Range`). Un bundle pèse des
   * mégaoctets et cette sonde tourne à chaque rafraîchissement de l'écran : la
   * télécharger en entier ferait payer le diagnostic plus cher que ce qu'il
   * observe. `206` comme `200` valent réponse ; seul l'échec nous intéresse.
   */
  private async checkEntry(entry: string, startedAt: number): Promise<ProbeOutcome> {
    const asset = await this.http(entry, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await asset.body?.cancel();
    if (!asset.ok) {
      return failed(startedAt, `point d'entrée ${fileNameOf(entry)} : ${asset.status}`);
    }
    return { verdict: "up", latencyMs: Date.now() - startedAt };
  }
}

function failed(startedAt: number, detail: string): ProbeOutcome {
  return { verdict: "down", latencyMs: Date.now() - startedAt, detail };
}

const SCRIPT_SRC = /<script\b[^>]*\bsrc="([^"]+)"/gi;

/**
 * Le premier script de même origine que la page. « De même origine » exclut les
 * balises tierces (mesure d'audience, widgets) : leur panne n'est pas la nôtre,
 * et la compter comme telle rendrait la carte rouge pour le compte d'autrui.
 */
export function entryScriptOf(html: string, origin: string): string | undefined {
  const base = new URL(origin);
  for (const match of html.matchAll(SCRIPT_SRC)) {
    const src = match[1];
    if (src === undefined) {
      continue;
    }
    const url = new URL(src, base);
    if (url.origin === base.origin) {
      return url.toString();
    }
  }
  return undefined;
}

function fileNameOf(url: string): string {
  const segments = new URL(url).pathname.split("/");
  return segments[segments.length - 1] ?? url;
}
