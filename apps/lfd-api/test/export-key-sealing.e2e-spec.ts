/**
 * E2E **la clé d'export n'ouvre que l'export** (lot E3,
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.5).
 *
 * La liste des routes n'est écrite nulle part ici : elle est lue sur
 * l'application démarrée — le routeur Express dit QUELLES routes répondent,
 * les métadonnées Nest disent lesquelles sont `@Public()`. Une route ajoutée
 * demain est éprouvée sans qu'on y pense, et une route que les deux ne
 * savent pas apparier fait échouer la suite plutôt que de passer en silence.
 *
 * Chaque route est appelée avec une clé d'export valide et sans autre jeton :
 * - une route qui attend une identité répond 401 ou 403 ;
 * - une route `@Public()` répond le même statut qu'à un appel anonyme : la
 *   clé n'y change rien. `@Public()` ne veut dire que « hors de la garde
 *   Auth0 des clients » : toute la surface du staff l'est aussi
 *   (`@AdminSurface` pose ses propres gardes), et y répond donc 401 avec la
 *   clé comme sans elle — l'égalité le prouve sans lister qui garde quoi ;
 * - `GET /exports/sales` seule est ouverte par la clé.
 *
 * Doublée : la signature des jetons staff.
 */
import type { IssuedExportReaderKeyResponse } from "@lfd/contracts";
import { MODULE_PATH, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import type request from "supertest";

import { IS_PUBLIC_KEY } from "../src/platform/auth/public.decorator.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const EXPORT_ROUTE = "GET /exports/sales";
const KEY_HEADER = "x-export-key";
const CLIENT_IP = "x-lfc-client-ip";
const PROBE_SEGMENT = "e2e-sonde";
/** Un appel qui ne répond pas en cinq secondes est un flux (SSE) : il compte comme non ouvert. */
const PROBE_TIMEOUT_MS = 5_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const DENIED = new Set([401, 403]);

/** Une route servie : sa méthode, son chemin Express, et si Nest la dit publique. */
interface ServedRoute {
  readonly method: string;
  readonly path: string;
  readonly isPublic: boolean;
}

let ctx: E2eContext;
let secret = "";
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
  await ctx.reset();
  const issued = jsonBody<IssuedExportReaderKeyResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/export-keys")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "Direction",
        expiresAt: new Date(Date.now() + 365 * DAY_MS).toISOString(),
        allowedIps: [],
      })
      .expect(201),
  );
  secret = issued.secret;
});

afterAll(async () => {
  await ctx.close();
});

/** Les objets du routeur Express, lus sans les typer comme ce qu'ils ne promettent pas. */
function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  // L'application Express est une fonction : elle porte ses propriétés comme un objet.
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? (value as Record<string, unknown>)
    : null;
}

/** `[méthode, chemin]` de chaque route que le routeur Express sert. */
function expressRoutes(): readonly (readonly [string, string])[] {
  const instance = recordOf(ctx.app.getHttpAdapter().getInstance());
  const router = recordOf(instance?.["router"]);
  const stack = router?.["stack"];
  if (!Array.isArray(stack)) {
    throw new Error("Le routeur Express n'expose plus sa pile : la sonde ne lit plus rien.");
  }
  return stack.flatMap((layer: unknown) => {
    const route = recordOf(recordOf(layer)?.["route"]);
    const path = route?.["path"];
    const methods = recordOf(route?.["methods"]);
    if (typeof path !== "string" || methods === null) {
      return [];
    }
    return Object.keys(methods)
      .filter((method) => methods[method] === true && method !== "_all")
      .map((method) => [method.toUpperCase(), path] as const);
  });
}

const leading = (path: string): string => (path.startsWith("/") ? path : `/${path}`);
const trailing = (path: string): string => (path.length > 1 ? path.replace(/\/+$/u, "") : path);

/** Les fragments d'un chemin déclaré : un, plusieurs, ou aucun. */
function fragmentsOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [""];
}

/** Les chemins composés comme Nest les compose : module, contrôleur, méthode. */
function joined(...parts: readonly (readonly string[])[]): readonly string[] {
  return parts.reduce<readonly string[]>(
    (paths, fragments) =>
      paths.flatMap((path) =>
        fragments.map((fragment) =>
          fragment === "" ? path : `${path.replace(/\/+$/u, "")}${leading(fragment)}`,
        ),
      ),
    [""],
  );
}

/** `"GET /a/b"` → publique ?, pour chaque handler de chaque contrôleur de l'application. */
function declaredRoutes(): ReadonlyMap<string, boolean> {
  const container = ctx.app.get(ModulesContainer);
  const declared = new Map<string, boolean>();
  for (const module of container.values()) {
    const modulePath: unknown = Reflect.getMetadata(
      `${MODULE_PATH}${container.applicationId ?? ""}`,
      module.metatype,
    );
    for (const wrapper of module.controllers.values()) {
      const controller: unknown = wrapper.metatype;
      if (typeof controller !== "function") {
        continue;
      }
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
      const classPaths = fragmentsOf(Reflect.getMetadata(PATH_METADATA, controller));
      const prototype = recordOf(recordOf(controller)?.["prototype"]) ?? {};
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === "constructor" || typeof handler !== "function") {
          continue;
        }
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        if (typeof method !== "number") {
          continue;
        }
        const isPublic = classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true;
        const verb = RequestMethod[method] ?? "UNKNOWN";
        for (const path of joined(
          fragmentsOf(modulePath),
          classPaths,
          fragmentsOf(Reflect.getMetadata(PATH_METADATA, handler)),
        )) {
          declared.set(`${verb} ${trailing(leading(path))}`, isPublic);
        }
      }
    }
  }
  return declared;
}

/** Les routes servies, chacune appariée à sa métadonnée ; les orphelines nommées. */
function servedRoutes(): { routes: readonly ServedRoute[]; orphans: readonly string[] } {
  const declared = declaredRoutes();
  const routes: ServedRoute[] = [];
  const orphans: string[] = [];
  for (const [method, path] of expressRoutes()) {
    const isPublic = declared.get(`${method} ${path}`);
    if (isPublic === undefined) {
      orphans.push(`${method} ${path}`);
    } else {
      routes.push({ method, path, isPublic });
    }
  }
  return { routes, orphans };
}

/** Un chemin appelable : chaque paramètre et chaque joker remplacés par un segment sonde. */
function concrete(path: string): string {
  return path
    .replace(/\{\/?\*[^}]*\}/gu, `/${PROBE_SEGMENT}`)
    .replace(/\*[A-Za-z0-9_]*/gu, PROBE_SEGMENT)
    .replace(/:[A-Za-z0-9_]+/gu, PROBE_SEGMENT)
    .replace(/[{}]/gu, "");
}

/** Une adresse neuve par appel : le seau par IP ne doit pas répondre à la place des gardes. */
function nextIp(): string {
  ipSeq += 1;
  return `10.${String((ipSeq >> 16) & 255)}.${String((ipSeq >> 8) & 255)}.${String(ipSeq & 255)}`;
}

/** La requête d'un verbe ; `null` pour un verbe que la sonde ne sait pas porter. */
function requestFor(agent: request.Agent, method: string, path: string): request.Test | null {
  switch (method) {
    case "GET":
      return agent.get(path);
    case "HEAD":
      return agent.head(path);
    case "OPTIONS":
      return agent.options(path);
    case "POST":
      return agent.post(path).send({});
    case "PUT":
      return agent.put(path).send({});
    case "PATCH":
      return agent.patch(path).send({});
    case "DELETE":
      return agent.delete(path).send({});
    default:
      return null;
  }
}

/** Le statut d'un appel, ou `"timeout"` pour un flux qui ne se ferme pas. */
async function statusOf(route: ServedRoute, withKey: boolean): Promise<number | "timeout"> {
  const call = requestFor(ctx.http(), route.method, concrete(route.path));
  if (call === null) {
    throw new Error(`Verbe ${route.method} inconnu de la sonde (${route.path}) : l'ajouter.`);
  }
  call.set(CLIENT_IP, nextIp()).timeout(PROBE_TIMEOUT_MS);
  if (withKey) {
    call.set(KEY_HEADER, secret);
  }
  try {
    return (await call).status;
  } catch (error) {
    if (recordOf(error)?.["timeout"] !== undefined) {
      return "timeout";
    }
    throw error;
  }
}

describe("la clé d'export n'ouvre que l'export (§ 6.5)", () => {
  it("chaque route servie est appariée à sa déclaration Nest", () => {
    const { routes, orphans } = servedRoutes();

    expect(orphans).toEqual([]);
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter((route) => `${route.method} ${route.path}` === EXPORT_ROUTE)).toEqual([
      { method: "GET", path: "/exports/sales", isPublic: true },
    ]);
  });

  it("🔴 une route qui attend une identité refuse la clé (401 ou 403)", async () => {
    const guarded = servedRoutes().routes.filter((route) => !route.isPublic);
    const opened: string[] = [];

    for (const route of guarded) {
      const status = await statusOf(route, true);
      if (status === "timeout" || !DENIED.has(status)) {
        opened.push(`${route.method} ${route.path} → ${String(status)}`);
      }
    }

    expect(opened).toEqual([]);
  }, 300_000);

  it("🔴 une route publique répond pareil avec la clé et sans", async () => {
    const open = servedRoutes().routes.filter(
      (route) => route.isPublic && `${route.method} ${route.path}` !== EXPORT_ROUTE,
    );
    const changed: string[] = [];

    for (const route of open) {
      const anonymous = await statusOf(route, false);
      const keyed = await statusOf(route, true);
      if (anonymous !== keyed) {
        changed.push(`${route.method} ${route.path} : ${String(anonymous)} → ${String(keyed)}`);
      }
    }

    expect(open.length).toBeGreaterThan(0);
    expect(changed).toEqual([]);
  }, 300_000);

  it("la route d'export, elle, s'ouvre à la clé", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await ctx
      .http()
      .get("/exports/sales")
      .query({ from: day, to: day })
      .set(CLIENT_IP, nextIp())
      .set(KEY_HEADER, secret)
      .expect(200);
  });
});
