import {
  ADMIN_PERMISSION_KEY,
  ADMIN_RESOURCE_KEY,
} from "../../../../platform/auth/admin-surface.keys.js";
import { AdminPromotionsController } from "../admin-promotions.controller.js";

/**
 * **Le droit unique des promotions** (`documentation/promotions/plan-un-seul-endroit.md`,
 * 2026-10-31) : toute promotion s'écrit sous `b2b_pricing`, « retrait à un
 * point » compris ; `lfc_site_settings` ne garde que la lecture. Le décorateur
 * ne pose que des métadonnées que le guard lit ; ce qu'on éprouve ici est ce
 * qui est DÉCLARÉ — une écriture ouverte à un second droit ne se verrait
 * qu'en production.
 */

function permissionsOf(proto: object, route: string): readonly string[] | undefined {
  const method: unknown = Reflect.get(proto, route);
  if (typeof method !== "function") {
    throw new TypeError(`${route} n'est pas une route`);
  }
  const declared: unknown = Reflect.getMetadata(ADMIN_PERMISSION_KEY, method);
  return Array.isArray(declared) ? declared.map(String) : undefined;
}

const WRITES = ["pose", "revise", "pause", "resume", "archive"] as const;

describe("l'écran Promotions — le seul endroit, sous b2b_pricing", () => {
  const proto = AdminPromotionsController.prototype;

  it("est déclaré sur la ressource des règles de prix", () => {
    expect(Reflect.getMetadata(ADMIN_RESOURCE_KEY, AdminPromotionsController)).toBe("b2b_pricing");
  });

  it.each(WRITES)(
    "`%s` n'ouvre aucune exception : son droit se déduit du verbe (b2b_pricing:write seul)",
    (name) => {
      expect(permissionsOf(proto, name)).toBeUndefined();
    },
  );

  it("les lectures s'ouvrent aussi à lfc_site_settings:read", () => {
    expect(permissionsOf(proto, "list")).toEqual(["b2b_pricing:read", "lfc_site_settings:read"]);
    expect(permissionsOf(proto, "get")).toEqual(["b2b_pricing:read", "lfc_site_settings:read"]);
  });

  it("la source reste lisible des anciens éditeurs, en lecture seulement", () => {
    expect(permissionsOf(proto, "source")).toEqual([
      "b2b_pricing:read",
      "lfc_site_settings:read",
      "b2b_settings:read",
    ]);
  });

  it("ne laisse aucune écriture dans les droits de lecture", () => {
    const granted = (["list", "get", "source"] as const).flatMap(
      (route) => permissionsOf(proto, route) ?? [],
    );
    expect(granted.filter((permission) => permission.endsWith(":write"))).toEqual([]);
  });
});
