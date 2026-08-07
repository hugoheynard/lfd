import type { NextFunction, Request, Response } from "express";

import { requestContextMiddleware } from "../request-context.middleware.js";
import { currentRequestContext } from "../request-context.store.js";
import type { RequestContext } from "../request-context.js";

/** Construit une fausse requête Express avec les en-têtes donnés. */
function fakeRequest(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

/**
 * Le middleware d'ingress : pose le contexte AUTOUR de `next`, dérive le traceId
 * du `traceparent`, et gèle un `now` par requête. C'est le point d'entrée du
 * temps métier et de la traçabilité.
 */
describe("requestContextMiddleware", () => {
  const res = {} as Response;

  /** Exécute le middleware et capture le contexte vu à l'intérieur de `next`. */
  function run(headers: Record<string, string | undefined>): RequestContext | null {
    let captured: RequestContext | null = null;
    const next: NextFunction = () => {
      captured = currentRequestContext();
    };
    requestContextMiddleware(fakeRequest(headers), res, next);
    return captured;
  }

  it("établit un contexte visible pendant next()", () => {
    const context = run({});
    expect(context).not.toBeNull();
  });

  it("dérive le traceId du traceparent entrant", () => {
    const context = run({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("génère un traceId quand le traceparent est absent", () => {
    expect(run({})?.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gèle un `now` de type Date pour la requête", () => {
    const context = run({});
    expect(context?.now).toBeInstanceOf(Date);
  });

  it("ne laisse aucun contexte fuir après le retour du middleware", () => {
    run({});
    expect(currentRequestContext()).toBeNull();
  });
});
