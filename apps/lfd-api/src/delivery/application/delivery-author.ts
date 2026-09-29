import {
  StaffAuthorDirectory,
  staffAuthorName,
} from "../../staff/directory/domain/staff-author-directory.js";
import type { DeliveryAuthor } from "../domain/entities/departure-choice.js";

/**
 * Qui fait le geste, **figé maintenant** : l'id de fiche toujours, le nom et le
 * rôle quand l'annuaire les connaît, vides sinon — on n'invente pas un nom.
 */
export async function deliveryAuthorOf(
  directory: StaffAuthorDirectory,
  staffUserId: string,
): Promise<DeliveryAuthor> {
  const author = (await directory.identify([staffUserId])).find(staffUserId);
  return {
    staffUserId,
    name: author === null ? "" : (staffAuthorName(author) ?? ""),
    role: author?.role ?? "",
  };
}
