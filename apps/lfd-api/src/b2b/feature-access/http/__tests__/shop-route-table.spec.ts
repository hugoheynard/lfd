import { readdirSync } from "node:fs";
import { join } from "node:path";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";

import { OrderPreflightController } from "../../../alerts/http/order-preflight.controller.js";
import { ShopCatalogueController } from "../../../catalog/http/shop-catalogue.controller.js";
import { CompanyOrdersController } from "../../../orders/http/company-orders.controller.js";
import { MyShopCatalogueController } from "../../../orders/http/my-shop-catalogue.controller.js";
import { MyShopQuoteController } from "../../../orders/http/my-shop-quote.controller.js";
import { OrdersController } from "../../../orders/http/orders.controller.js";
import { ShopCartController } from "../../../orders/http/shop-cart.controller.js";
import { ShopOrdersController } from "../../../orders/http/shop-orders.controller.js";
import { ShopQuoteController } from "../../../orders/http/shop-quote.controller.js";
import { SubscriptionsController } from "../../../subscriptions/http/subscriptions.controller.js";
import { REQUIRES_SHOP_KEY, type ShopRequirement } from "../requires-shop.decorator.js";

/**
 * **La table des routes de la boutique** — plan
 * `documentation/auth-inscription/plan-inscription-pro-seule.md` §2.3.
 *
 * Chaque route CLIENTE des commandes, de la boutique, des paniers récurrents et
 * du contrôle de panier porte `@RequiresShop`, ou figure ci-dessous avec sa
 * raison. Une route ajoutée demain sans décision fait échouer ce test : c'est
 * ce qui empêche une commande de passer, boutique fermée, par une porte que
 * personne n'a pensé à marquer.
 *
 * Lu par **réflexion** sur les métadonnées Nest, pas dans les sources : c'est
 * ce que la garde lira, et un commentaire ne peut pas le satisfaire.
 */

/** Ce que le plan ferme, et à quel niveau. */
const MARKED: Readonly<Record<string, ShopRequirement>> = {
  "GET /shop/catalogue": "browse",
  "GET /shop/catalogue/mine": "browse",
  "POST /shop/quote": "browse",
  "POST /shop/quote/mine": "browse",
  "GET /shop/cart": "browse",
  "PUT /shop/cart": "browse",
  "POST /orders": "order",
  // La commande sans compte. Marquée comme sa jumelle connectée : boutique
  // fermée, aucune des deux ne passe.
  //
  // ⚠️ Son contrôleur n'est **pas enregistré** dans `OrdersModule` tant que
  // l'arbitrage de prix n'a pas eu lieu (plan `plan-commande-sans-compte.md`
  // §6) — la route n'existe donc pas à l'exécution. Ce test-ci lit les
  // métadonnées de la CLASSE, pas la table de routage de l'application : il
  // continue donc de tenir la décision, et c'est ce qu'on veut — le jour où
  // quelqu'un branchera le contrôleur, la décision sera déjà écrite.
  "POST /shop/orders": "order",
  "POST /orders/quote": "order",
  "POST /orders/preflight": "order",
  "POST /subscriptions": "order",
  "PUT /subscriptions/:id/occurrences/:date": "order",
  // Pause comprise : la même route sert la pause et la reprise (Q5).
  "PATCH /subscriptions/:id/status": "order",
};

/** Ce qui reste joignable à tous les niveaux, et pourquoi. */
const UNMARKED: Readonly<Record<string, string>> = {
  "GET /orders/mine": "une commande déjà passée se retrouve boutique fermée (§2.3, S6)",
  "GET /orders/:id": "une commande déjà passée se retrouve boutique fermée (§2.3, S6)",
  "GET /orders/:id/bon": "le bon d'une commande existante reste lisible (§2.3)",
  "GET /orders/:id/bon.pdf": "le bon d'une commande existante reste lisible (§2.3)",
  "GET /orders/:id/payment": "le règlement d'une commande existante reste possible (§2.3, S6)",
  "GET /companies/:companyId/orders": "les commandes existantes de la société (§2.3)",
  "GET /subscriptions/mine": "relire ses paniers récurrents ne passe aucune commande",
  // Tranché le 2026-09-14 : retirer un engagement ne passe aucune commande, et
  // garder quelqu'un captif d'un panier récurrent parce que la boutique ferme
  // serait l'inverse de ce que la fermeture protège.
  "DELETE /subscriptions/:id": "supprimer un panier récurrent ne passe aucune commande",
};

const CONTROLLERS = [
  ShopCatalogueController,
  MyShopCatalogueController,
  ShopQuoteController,
  MyShopQuoteController,
  ShopCartController,
  ShopOrdersController,
  OrdersController,
  CompanyOrdersController,
  SubscriptionsController,
  OrderPreflightController,
] as const;

/** Les dossiers dont TOUT contrôleur client doit figurer dans `CONTROLLERS`. */
const CLIENT_CONTROLLER_FILES: Readonly<Record<string, readonly string[]>> = {
  "b2b/orders/http": [
    "company-orders.controller.ts",
    "my-shop-catalogue.controller.ts",
    "my-shop-quote.controller.ts",
    "orders.controller.ts",
    "shop-cart.controller.ts",
    "shop-orders.controller.ts",
    "shop-quote.controller.ts",
  ],
  "b2b/subscriptions/http": ["subscriptions.controller.ts"],
  "b2b/alerts/http": ["order-preflight.controller.ts"],
};

interface ClientRoute {
  readonly route: string;
  readonly requirement: ShopRequirement | undefined;
}

const reflector = new Reflector();

function joinPath(...parts: readonly string[]): string {
  const joined = parts.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function routesOf(controller: (typeof CONTROLLERS)[number]): readonly ClientRoute[] {
  const base = reflector.get<string | undefined>(PATH_METADATA, controller) ?? "";
  const prototype: unknown = Object.getOwnPropertyDescriptor(controller, "prototype")?.value;
  if (typeof prototype !== "object" || prototype === null) {
    return [];
  }
  return Object.getOwnPropertyNames(prototype).flatMap((name) => {
    const handler: unknown = Reflect.get(prototype, name);
    if (name === "constructor" || typeof handler !== "function") {
      return [];
    }
    const method = reflector.get<RequestMethod | undefined>(METHOD_METADATA, handler);
    const path = reflector.get<string | undefined>(PATH_METADATA, handler);
    if (method === undefined || path === undefined) {
      return [];
    }
    const requirement = reflector.getAllAndOverride<ShopRequirement | undefined>(
      REQUIRES_SHOP_KEY,
      [handler, controller],
    );
    return [{ route: `${RequestMethod[method]} ${joinPath(base, path)}`, requirement }];
  });
}

const ROUTES = CONTROLLERS.flatMap(routesOf);

describe("la table des routes de la boutique", () => {
  it("en trouve — sinon ce test se croirait vert en ne regardant rien", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(Object.keys(MARKED).length);
  });

  it.each(Object.entries(CLIENT_CONTROLLER_FILES))(
    "connaît chaque contrôleur client de %s",
    (directory, expected) => {
      const found = readdirSync(join(process.cwd(), "src", directory))
        .filter((file) => file.endsWith(".controller.ts") && !file.startsWith("admin-"))
        .sort();

      expect(found).toEqual([...expected].sort());
    },
  );

  it.each(ROUTES.map((entry) => [entry.route, entry.requirement]))(
    "%s a une décision écrite",
    (route, requirement) => {
      const decided = MARKED[route] ?? (route in UNMARKED ? "aucun" : "non décidée");

      expect(requirement ?? "aucun").toBe(decided);
    },
  );

  it("ne garde aucune décision pour une route qui n'existe plus", () => {
    const existing = new Set(ROUTES.map((entry) => entry.route));
    const stale = [...Object.keys(MARKED), ...Object.keys(UNMARKED)].filter(
      (route) => !existing.has(route),
    );

    expect(stale).toEqual([]);
  });
});
