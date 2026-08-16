import type { ExecutionContext } from "@nestjs/common";

import { RecomputeGuard } from "../recompute.guard.js";
import type { AppConfig } from "../../config/app-config.js";

/** La configuration réduite à ce que le guard lit. */
function configStub(token: string | null, devBypass = false): AppConfig {
  return {
    adminDevBypass: () => devBypass,
    recomputeToken: () => token,
  } as AppConfig;
}

/** Un contexte Nest réduit à ses en-têtes. */
function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as ExecutionContext;
}

describe("la porte machine-à-machine du recompute", () => {
  it("laisse passer le bon jeton", () => {
    const guard = new RecomputeGuard(configStub("s3cr3t"));

    expect(guard.canActivate(contextWith({ "x-lfc-recompute-token": "s3cr3t" }))).toBe(true);
  });

  it("ignore les espaces autour du jeton présenté", () => {
    // La valeur ATTENDUE est trimée en lisant l'environnement. Sans symétrie
    // ici, un jeton collé avec une espace en trop rendrait un 401 opaque : le
    // secret serait le bon, et rien ne le dirait.
    const guard = new RecomputeGuard(configStub("s3cr3t"));

    expect(guard.canActivate(contextWith({ "x-lfc-recompute-token": "  s3cr3t\n" }))).toBe(true);
  });

  it("refuse un jeton faux, absent, ou non configuré", () => {
    const guard = new RecomputeGuard(configStub("s3cr3t"));

    expect(() => guard.canActivate(contextWith({ "x-lfc-recompute-token": "autre" }))).toThrow();
    expect(() => guard.canActivate(contextWith({}))).toThrow();
    // Fail-closed : jeton non configuré ⇒ refus, jamais un endpoint batch ouvert.
    expect(() =>
      new RecomputeGuard(configStub(null)).canActivate(
        contextWith({ "x-lfc-recompute-token": "s3cr3t" }),
      ),
    ).toThrow();
  });

  it("ne demande rien en bypass de développement", () => {
    const guard = new RecomputeGuard(configStub(null, true));

    expect(guard.canActivate(contextWith({}))).toBe(true);
  });
});
