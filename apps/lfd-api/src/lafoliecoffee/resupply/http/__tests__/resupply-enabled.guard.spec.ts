import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  InMemoryResupplySwitch,
  InMemoryResupplySwitchReader,
} from "../../application/__tests__/resupply-switch-doubles.js";
import { ResupplyDisabledError } from "../../domain/resupply-switch-errors.js";
import { PassesWhenResupplyOff, ResupplyEnabledGuard } from "../resupply-enabled.guard.js";

/** L'instant n'est que gelé : le garde ne lit pas l'horloge. */
const POSED_AT = new Date("2026-01-02T08:00:00Z");

/** Une route ordinaire, et une route qui finit un réassort déjà envoyé. */
class Routes {
  plain(): void {}

  @PassesWhenResupplyOff("finir un réassort déjà envoyé")
  finishes(): void {}
}

/** Un contexte Nest réduit à son verbe et à sa route. */
function contextWith(method: string, handler: keyof Routes = "plain"): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
    getHandler: () => Routes.prototype[handler],
  } as ExecutionContext;
}

function guardWith(enabled: boolean | null): ResupplyEnabledGuard {
  const store = new InMemoryResupplySwitch();
  if (enabled !== null) {
    store.posed = {
      enabled,
      updated: { at: POSED_AT, author: { staffUserId: "staff_lou", name: "Lou", role: "admin" } },
    };
  }
  return new ResupplyEnabledGuard(new InMemoryResupplySwitchReader(store), new Reflector());
}

describe("ResupplyEnabledGuard", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "jamais posé, refuse un %s (409 resupply.disabled)",
    async (method) => {
      await expect(guardWith(null).canActivate(contextWith(method))).rejects.toBeInstanceOf(
        ResupplyDisabledError,
      );
    },
  );

  it("éteint, refuse une écriture avec le message qui dit où l'allumer", async () => {
    await expect(guardWith(false).canActivate(contextWith("POST"))).rejects.toMatchObject({
      code: "resupply.disabled",
      message: "Le réassort est désactivé — il s'allume dans Réglages › Production › Fournil.",
    });
  });

  it.each(["GET", "HEAD", "get"])("éteint, laisse passer une lecture (%s)", async (method) => {
    await expect(guardWith(false).canActivate(contextWith(method))).resolves.toBe(true);
  });

  it("allumé, laisse passer une écriture", async () => {
    await expect(guardWith(true).canActivate(contextWith("POST"))).resolves.toBe(true);
  });

  it("éteint, laisse passer une écriture qui finit un réassort déjà envoyé", async () => {
    await expect(guardWith(false).canActivate(contextWith("POST", "finishes"))).resolves.toBe(true);
  });
});
