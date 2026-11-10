/**
 * Le détenteur d'un `company.declared`, sous ses deux formes en base : `owner`
 * (`{ id, name }`, depuis le lot B du plan des phrases, 2026-09-19) et
 * `ownerUserId` (l'id seul, avant). Le journal ne se réécrit pas : les deux
 * coexistent pour toujours.
 */
export function declaredOwnerOf(payload: Record<string, unknown>): string | null {
  const owner = payload["owner"];
  if (typeof owner === "object" && owner !== null && "id" in owner) {
    return stringOrNull(owner.id);
  }
  return stringOrNull(payload["ownerUserId"]);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
