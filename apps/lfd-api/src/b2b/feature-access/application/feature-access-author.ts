import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import type { StaffDirectory } from "../../account/domain/ports/staff-directory.js";

/**
 * Qui fait le geste, **figé maintenant** : le `sub` toujours, le nom et le rôle
 * quand l'annuaire les connaît — comme la certification d'un KBIS. Vides
 * sinon : on n'invente pas un nom.
 */
export async function authorOf(staff: StaffDirectory, staffSub: string): Promise<StaffTrace> {
  const agent = await staff.identify(staffSub);
  return { sub: staffSub, name: agent?.name ?? "", role: agent?.role ?? "" };
}
