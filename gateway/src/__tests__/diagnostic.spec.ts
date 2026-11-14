import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_HEADER,
  isDiagnostic,
  sortDiagnosticHeaders,
  withoutDiagnosticSecret,
} from "../diagnostic.js";

const SECRET = "secret-de-diagnostic-pour-le-test";

function request(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) {
    headers.set(DIAGNOSTIC_HEADER, header);
  }
  return new Request("https://passerelle.test/shop/catalogue", { headers });
}

function measured(): Response {
  const headers = new Headers({
    "Server-Timing": "app;dur=4.0, worker;dur=12.0",
    "X-Shelf-Cache": "public-on",
    "Cache-Control": "public, max-age=30",
    "Content-Type": "application/json",
  });
  headers.append("Set-Cookie", "a=1");
  headers.append("Set-Cookie", "b=2");
  return new Response('{"ok":true}', { status: 200, headers });
}

describe("isDiagnostic", () => {
  it("est faux sans secret configuré, quel que soit l'en-tête", async () => {
    expect(await isDiagnostic(request(SECRET), undefined)).toBe(false);
    expect(await isDiagnostic(request(""), "")).toBe(false);
  });

  it("est faux sans en-tête", async () => {
    expect(await isDiagnostic(request(), SECRET)).toBe(false);
  });

  it("est faux pour un en-tête faux, de même longueur ou non, sans lever", async () => {
    const sameLength = `${SECRET.slice(0, -1)}X`;
    expect(await isDiagnostic(request(sameLength), SECRET)).toBe(false);
    expect(await isDiagnostic(request("court"), SECRET)).toBe(false);
    expect(await isDiagnostic(request(`${SECRET}-plus-long`), SECRET)).toBe(false);
  });

  it("est vrai pour le bon secret", async () => {
    expect(await isDiagnostic(request(SECRET), SECRET)).toBe(true);
  });
});

describe("withoutDiagnosticSecret", () => {
  it("retire le secret de la requête transmise et garde le reste", () => {
    const original = request(SECRET);
    original.headers.set("x-autre", "1");
    const forwarded = withoutDiagnosticSecret(original);
    expect(forwarded.headers.has(DIAGNOSTIC_HEADER)).toBe(false);
    expect(forwarded.headers.get("x-autre")).toBe("1");
    expect(forwarded.url).toBe(original.url);
  });
});

describe("sortDiagnosticHeaders", () => {
  it("efface les mesures sans diagnostic et ne touche à rien d'autre", async () => {
    const sorted = sortDiagnosticHeaders(measured(), false);
    expect(sorted.headers.has("server-timing")).toBe(false);
    expect(sorted.headers.has("x-shelf-cache")).toBe(false);
    expect(sorted.status).toBe(200);
    expect(sorted.headers.get("cache-control")).toBe("public, max-age=30");
    expect(sorted.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await sorted.text()).toBe('{"ok":true}');
  });

  it("garde les mesures en diagnostic, et interdit qu'un cache en aval les garde", () => {
    const sorted = sortDiagnosticHeaders(measured(), true);
    expect(sorted.headers.get("server-timing")).toBe("app;dur=4.0, worker;dur=12.0");
    expect(sorted.headers.get("x-shelf-cache")).toBe("public-on");
    expect(sorted.headers.get("cache-control")).toBe("private, no-store");
  });

  it("efface aussi les mesures d'une réponse fabriquée par la passerelle", () => {
    const fault = new Response("Gateway LFC : x.", {
      status: 502,
      headers: { "Server-Timing": "gateway;dur=1.0" },
    });
    expect(sortDiagnosticHeaders(fault, false).headers.has("server-timing")).toBe(false);
  });
});
