import { Prisma } from "../../../platform/database/client/client.js";
import { isCompanyClosed } from "../../shared/company-standing/domain/company-closure.js";
import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import { OrderCompanyClosedError } from "../domain/errors/order-company-closed.error.js";

/** Les colonnes que le prédicat « la société est fermée » lit, telles que le SQL les rend. */
interface ClosureRow {
  readonly id: string;
  readonly status: StandingCompanyStatus;
  readonly archived_at: Date | null;
}

/**
 * **Le verrou de la passation** : `FOR SHARE` sur la ligne `companies` de la
 * société de la commande et de son principal, dans la transaction qui écrit la
 * commande, puis refus d'une société fermée (`isCompanyClosed`).
 *
 * La suppression prend `FOR UPDATE` sur la même ligne avant de lire si le
 * compte a des commandes, et la résiliation l'écrit : les deux se sérialisent
 * avec la passation. Une commande passée au même instant fait soit échouer la
 * suppression (elle voit la commande), soit est refusée ici.
 *
 * Les lignes sont prises dans l'ordre des identifiants : deux gestes qui
 * verrouillent les mêmes sociétés les prennent dans le même ordre. Un `FOR
 * SHARE` ne bloque pas un autre `FOR SHARE` : deux passations ne s'attendent pas.
 *
 * @throws {OrderCompanyClosedError} une des sociétés est fermée.
 */
export async function lockOpenCompanies(
  tx: Prisma.TransactionClient,
  companyIds: readonly (string | null)[],
): Promise<void> {
  const ids = [...new Set(companyIds.filter((id): id is string => id !== null))].sort();
  if (ids.length === 0) {
    return;
  }
  const rows = await tx.$queryRaw<ClosureRow[]>`
    SELECT id, status::text AS status, archived_at FROM companies
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR SHARE`;
  const closed = rows.find((row) =>
    isCompanyClosed({ status: row.status, archivedAt: row.archived_at }),
  );
  if (closed !== undefined) {
    throw new OrderCompanyClosedError(closed.id);
  }
}
