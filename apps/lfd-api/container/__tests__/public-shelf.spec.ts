import {
  PUBLIC_SHELF_CACHE_CONTROL,
  PUBLIC_SHELF_CACHE_TAG,
} from "../../src/b2b/catalog/http/public-shelf-cache-headers";
import { PUBLIC_SETTINGS_CACHE_TAG } from "../../src/b2b/shared/public-settings-cache/domain/ports/public-settings-edge-cache";
import { SHOP_COPY_CACHE_TAG } from "../../src/b2b/shop-copy/domain/ports/shop-copy-edge-cache";
import {
  isPublicPurgeCall,
  isPublicPurgeRelay,
  PUBLIC_PURGE_PROPS,
  PUBLIC_SETTINGS_TAG,
  PUBLIC_SHELF_PURGE_PATH,
  PUBLIC_SHELF_TAG,
  PURGEABLE_TAGS,
  purgeableTagOf,
  purgeStatusOf,
  SHOP_COPY_TAG,
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

  it("purge l'étiquette des textes que l'API pose sur `GET /shop/copy`", () => {
    expect(SHOP_COPY_TAG).toBe(SHOP_COPY_CACHE_TAG);
    expect(PURGEABLE_TAGS).toEqual([PUBLIC_SHELF_TAG, SHOP_COPY_TAG, PUBLIC_SETTINGS_TAG]);
  });

  it("purge l'étiquette des réglages publics que l'API pose sur ses quatre routes", () => {
    expect(PUBLIC_SETTINGS_TAG).toBe(PUBLIC_SETTINGS_CACHE_TAG);
  });

  it("ne purge qu'une étiquette de la liste fermée, nommée une seule fois", () => {
    const at = (query: string): URL =>
      new URL(`http://rayons.interne${PUBLIC_SHELF_PURGE_PATH}${query}`);
    expect(purgeableTagOf(at("?tag=rayon-public"))).toBe(PUBLIC_SHELF_TAG);
    expect(purgeableTagOf(at("?tag=textes-boutique"))).toBe(SHOP_COPY_TAG);
    expect(purgeableTagOf(at("?tag=reglages-publics"))).toBe(PUBLIC_SETTINGS_TAG);
    expect(purgeableTagOf(at(""))).toBeNull();
    expect(purgeableTagOf(at("?tag="))).toBeNull();
    expect(purgeableTagOf(at("?tag=autre"))).toBeNull();
    expect(purgeableTagOf(at("?tag=rayon-public,autre"))).toBeNull();
    expect(purgeableTagOf(at("?tag=rayon-public&tag=textes-boutique"))).toBeNull();
    expect(purgeableTagOf(at("?tags=rayon-public"))).toBeNull();
  });

  it("une étiquette refusée rend 400, jamais un succès", () => {
    expect(purgeStatusOf({ kind: "unknown_tag" })).toBe(400);
  });

  it("seul « purgé » rend 204 : un cache absent ou un refus de Cloudflare ne passe pas pour un succès", () => {
    expect(purgeStatusOf({ kind: "purged" })).toBe(204);
    expect(purgeStatusOf({ kind: "cache_unavailable" })).toBe(503);
    expect(purgeStatusOf({ kind: "refused", errors: ["1015 rate limited"] })).toBe(502);
  });
});
