import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { OSRM_INTERNAL_HOST } from "../osrm-bridge";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Le code du Worker, SANS ses commentaires — qui citent justement les interdits. */
function workerCode(): string {
  const source = readFileSync(join(HERE, "../worker.ts"), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function wranglerConfig(): string {
  const source = readFileSync(join(HERE, "../../wrangler.jsonc"), "utf8");
  return source.replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Le Worker de `lfd-api` intercepte UN hôte à la sortie du conteneur,
 * `osrm.internal`, pour le passer à `lfd-osrm` (plan de tournée, L8-C10).
 *
 * Tout le reste de ce que le NestJS appelle — Stripe, Resend, Auth0, R2, la
 * base — doit sortir comme avant. Dans `@cloudflare/containers` 0.3.7, il
 * suffit d'UN réglage de plus sur `Backend` pour que la bibliothèque passe en
 * « tout intercepter » (`shouldInterceptAllOutbound`) : chaque appel sortant
 * de l'API traverserait alors ce Worker, ou serait refusé en 520. Aucun test
 * du NestJS ne le verrait ; la production, si.
 */
describe("l'interception de sortie du conteneur", () => {
  it.each([
    ["outbound ="],
    ["outboundHandlers"],
    ["outboundProxies"],
    ["outboundProxy"],
    ["allowedHosts"],
    ["deniedHosts"],
    ["setOutboundByHost"],
    ["setOutboundHandler"],
    ["setAllowedHosts"],
    ["setDeniedHosts"],
    ["interceptHttps"],
  ])("ne pose jamais `%s` — un seul fait tout intercepter", (forbidden) => {
    expect(workerCode()).not.toContain(forbidden);
  });

  it("laisse l'accès à Internet ouvert", () => {
    // `enableInternet` vrai est le défaut de la bibliothèque ; c'est lui qui
    // laisse sortir tout ce qui n'est pas `osrm.internal`.
    expect(workerCode()).not.toMatch(/enableInternet\s*=\s*false/);
  });

  it("n'intercepte que `osrm.internal`, par affectation", () => {
    // Un champ `static outboundByHost = …` court-circuiterait le setter hérité :
    // l'hôte serait intercepté, le proxy n'y trouverait aucun handler, et la
    // requête partirait sur Internet.
    const code = workerCode();
    expect(code).not.toMatch(/static\s+(override\s+)?outboundByHost\s*=/);
    const blocks = [...code.matchAll(/this\.outboundByHost\s*=\s*\{([\s\S]*?)\};/g)];
    expect(blocks).toHaveLength(1);
    const keys = [...blocks[0]![1]!.matchAll(/\[([A-Z_]+)\]\s*:/g)].map((match) => match[1]);
    expect(keys).toEqual(["OSRM_INTERNAL_HOST"]);
    expect(OSRM_INTERNAL_HOST).toBe("osrm.internal");
  });

  it("exporte `ContainerProxy`, sans quoi le conteneur ne démarre plus", () => {
    // La bibliothèque lève AVANT `container.start` s'il manque : l'API entière
    // tomberait, pas seulement le calcul routier.
    expect(workerCode()).toMatch(/export\s*\{\s*ContainerProxy\s*\}/);
    expect(wranglerConfig()).toMatch(/"compatibility_flags":\s*\[[^\]]*"enable_ctx_exports"/);
  });

  it("joint `lfd-osrm` par un service binding nommé OSRM", () => {
    expect(wranglerConfig()).toMatch(/"binding":\s*"OSRM",\s*"service":\s*"lfd-osrm"/);
  });
});
