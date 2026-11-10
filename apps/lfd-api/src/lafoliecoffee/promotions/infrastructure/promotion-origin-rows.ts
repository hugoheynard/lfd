import { isJsonRecord } from "../../../platform/database/json-columns.js";
import type { UnreadablePromotionRowError } from "../domain/errors/promotion-errors.js";
import type { PromotionOrigin } from "../domain/promotion.js";

type Unreadable = (detail: string) => UnreadablePromotionRowError;

/**
 * **L'origine d'une promotion reprise, relue de sa colonne JSON** — sortie de
 * `promotion-rows.ts` pour qu'il tienne sous trois cents lignes.
 */
export function originOf(value: unknown, unreadable: Unreadable): PromotionOrigin | null {
  if (value === null) {
    return null;
  }
  if (!isJsonRecord(value)) {
    throw unreadable("origine illisible");
  }
  if (value["kind"] === "price_rule" && typeof value["ruleId"] === "string") {
    return {
      kind: "price_rule",
      ruleId: value["ruleId"],
      ...(floorMemoOf(value["floor"]) ?? {}),
      ...(value["detached"] === undefined ? {} : { detached: value["detached"] }),
    };
  }
  const { siteId, clientele } = value;
  if (
    value["kind"] === "pickup_discount" &&
    typeof siteId === "string" &&
    typeof clientele === "string"
  ) {
    return { kind: "pickup_discount", siteId, clientele };
  }
  throw unreadable("origine inconnue");
}

function floorMemoOf(value: unknown): { readonly floor: { mode: string; value: number } } | null {
  if (
    isJsonRecord(value) &&
    typeof value["mode"] === "string" &&
    typeof value["value"] === "number"
  ) {
    return { floor: { mode: value["mode"], value: value["value"] } };
  }
  return null;
}
