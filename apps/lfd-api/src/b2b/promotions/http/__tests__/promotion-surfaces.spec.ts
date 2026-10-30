import {
  ADMIN_PERMISSION_KEY,
  ADMIN_RESOURCE_KEY,
} from "../../../../platform/auth/admin-surface.keys.js";
import { AdminPickupPromotionsController } from "../admin-pickup-promotions.controller.js";
import { AdminPromotionsController } from "../admin-promotions.controller.js";

/**
 * **Les droits des deux surfaces** (plan des promotions, § 13.9 et § 14
 * S-droits). Le décorateur ne pose que des métadonnées que le guard lit ; ce
 * qu'on éprouve ici est ce qui est DÉCLARÉ — une écriture dont le droit serait
 * déclaré en lecture, ou une surface sous la mauvaise ressource, ne se verrait
 * qu'en production.
 */

function permissionsOf(proto: object, route: string): readonly string[] | undefined {
  const method: unknown = Reflect.get(proto, route);
  if (typeof method !== "function") {
    throw new Error(`${route} n'est pas une route`);
  }
  const declared: unknown = Reflect.getMetadata(ADMIN_PERMISSION_KEY, method);
  return Array.isArray(declared) ? declared.map(String) : undefined;
}

function resourceOf(controller: abstract new (...args: never[]) => object): unknown {
  return Reflect.getMetadata(ADMIN_RESOURCE_KEY, controller);
}

const WRITES = ["pose", "revise", "pause", "resume", "archive"] as const;

describe("l'écran Promotions — sous b2b_pricing", () => {
  const proto = AdminPromotionsController.prototype;

  it("est déclaré sur la ressource des règles de prix", () => {
    expect(resourceOf(AdminPromotionsController)).toBe("b2b_pricing");
  });

  it.each(WRITES)(
    "`%s` n'ouvre aucune exception : son droit se déduit du verbe (écriture)",
    (name) => {
      expect(permissionsOf(proto, name)).toBeUndefined();
    },
  );

  it("les lectures s'ouvrent à l'un OU l'autre droit : chaque métier voit ce que l'autre a posé", () => {
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

describe("la fiche d'un site — sous lfc_site_settings, rien d'autre", () => {
  const proto = AdminPickupPromotionsController.prototype;

  it("est déclaré sur la ressource de la fiche du site, pas sur b2b_settings ni b2b_pricing", () => {
    expect(resourceOf(AdminPickupPromotionsController)).toBe("lfc_site_settings");
  });

  it.each([...WRITES, "list"] as const)("`%s` ne s'ouvre à aucun autre droit", (name) => {
    expect(permissionsOf(proto, name)).toBeUndefined();
  });
});
