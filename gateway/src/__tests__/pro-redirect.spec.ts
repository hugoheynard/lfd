import { describe, expect, it } from "vitest";

import gateway from "../index";

/**
 * Les anciennes adresses `/pro/…` RENVOIENT toujours vers la racine, requête
 * comprise — éprouvé à travers le VRAI `fetch` de la passerelle. `/pro` exact,
 * lui, est servi par la boutique depuis le 2026-10-19 : ce cas est tenu dans
 * `routes.spec.ts`, faute de pouvoir joindre l'hébergeur du front ici.
 */
async function call(path: string): Promise<Response> {
  return gateway.fetch(new Request(`https://lafoliecoffee.info${path}`), {});
}

describe("/pro/… — l'ancienne adresse renvoie vers la racine", () => {
  it.each([
    ["/pro/ouverture-compte-pro", "/ouverture-compte-pro"],
    ["/pro/boutique?x=1", "/boutique?x=1"],
  ])("%s → 302 %s", async (path, location) => {
    const response = await call(path);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(location);
  });
});
