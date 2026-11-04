import {
  PUBLIC_SHELF_CACHE_CONTROL,
  PUBLIC_SHELF_CACHE_TAG,
} from "../../src/b2b/catalog/http/public-shelf-cache-headers";
import {
  isPublicPurgeCall,
  isPublicPurgeRelay,
  PUBLIC_PURGE_PROPS,
  PUBLIC_SHELF_PURGE_PATH,
  PUBLIC_SHELF_TAG,
  purgeStatusOf,
} from "../public-shelf";

/**
 * Le rayon public côté Worker (`plan-cache-du-catalogue.md`, C3). Ces tests
 * échouent si une requête du dehors peut déclencher une purge, si l'étiquette
 * purgée diffère de celle que l'API pose, ou si un échec de purge passe pour
 * un succès.
 */
describe("la purge du rayon public", () => {
  it("purge l'étiquette que l'API pose, et l'API garde 30 s", () => {
    expect(PUBLIC_SHELF_TAG).toBe(PUBLIC_SHELF_CACHE_TAG);
    expect(PUBLIC_SHELF_CACHE_CONTROL).toBe("public, max-age=30");
  });

  it("n'est déclenchée que par la boucle locale, marquée de ses props", () => {
    expect(isPublicPurgeCall(PUBLIC_PURGE_PROPS, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(true);
    expect(isPublicPurgeCall({ ...PUBLIC_PURGE_PROPS }, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(
      true,
    );
  });

  it("refuse une requête du dehors : sans props, props vides ou d'une autre liaison", () => {
    expect(isPublicPurgeCall(undefined, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeCall(null, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeCall({}, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeCall({ purpose: "autre" }, "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeCall("public-shelf-purge", "POST", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
  });

  it("même marquée, ne purge que sur son chemin et en POST", () => {
    expect(isPublicPurgeCall(PUBLIC_PURGE_PROPS, "GET", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeCall(PUBLIC_PURGE_PROPS, "POST", "/shop/catalogue")).toBe(false);
  });

  it("le gestionnaire de sortie ne relaie que le POST de purge ; le reste va à l'objet", () => {
    expect(isPublicPurgeRelay("POST", PUBLIC_SHELF_PURGE_PATH)).toBe(true);
    expect(isPublicPurgeRelay("GET", PUBLIC_SHELF_PURGE_PATH)).toBe(false);
    expect(isPublicPurgeRelay("GET", "/public/state")).toBe(false);
    expect(isPublicPurgeRelay("POST", "/erase")).toBe(false);
  });

  it("seul « purgé » rend 204 : un cache absent ou un refus de Cloudflare ne passe pas pour un succès", () => {
    expect(purgeStatusOf({ kind: "purged" })).toBe(204);
    expect(purgeStatusOf({ kind: "cache_unavailable" })).toBe(503);
    expect(purgeStatusOf({ kind: "refused", errors: ["1015 rate limited"] })).toBe(502);
  });
});
