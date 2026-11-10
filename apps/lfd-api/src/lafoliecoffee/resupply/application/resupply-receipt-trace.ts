import type { Clock } from "../../../platform/time/clock.js";
import type { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../feature-access/application/feature-access-author.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";

/**
 * La trace d'un geste sur la liste : l'instant du `Clock`, l'auteur relu dans
 * l'annuaire. Partagée par les trois gestes du comptoir.
 */
export async function traceOf(
  staff: StaffDirectory,
  clock: Clock,
  staffUserId: string,
): Promise<ResupplyTrace> {
  return { at: clock.now(), author: await authorOf(staff, staffUserId) };
}
