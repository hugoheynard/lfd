import type { DeskActor } from "../../../channels/commerce/desk-actor.js";
import type { PlanVersionAuthor } from "../../domain/entities/plan-version.js";

/** L'auteur d'un geste du commerce, tel que la version du plan le garde : nom inconnu = `null`. */
export function deskAuthorOf(actor: DeskActor): PlanVersionAuthor {
  return actor.kind === "staff"
    ? { kind: "staff", staffId: actor.staffId, name: actor.name ?? null }
    : { kind: actor.kind };
}
