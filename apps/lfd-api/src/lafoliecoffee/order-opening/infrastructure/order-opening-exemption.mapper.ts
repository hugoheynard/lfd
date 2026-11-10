import type { OrderOpeningExemptionView } from "@lfd/contracts";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { OrderOpeningExemption as OrderOpeningExemptionModel } from "../../../platform/database/client/client.js";
import {
  OrderOpeningExemption,
  type ExemptionStamp,
  type ExemptionTarget,
} from "../domain/order-opening-exemption.js";

/** Une ligne que la contrainte `order_opening_exemptions_target_check` aurait dû refuser (**500**). */
class CorruptExemptionRowError extends TechnicalError {
  constructor(id: string) {
    super(
      "order_opening.exemption_row_corrupt",
      `L'exemption ${id} ne nomme ni société ni adresse : la ligne contredit la contrainte de la table. Signalez-la à l'équipe technique.`,
    );
  }
}

function targetOf(row: OrderOpeningExemptionModel): ExemptionTarget {
  if (row.kind === "company" && row.companyId !== null && row.companyName !== null) {
    return { kind: "company", companyId: row.companyId, companyName: row.companyName };
  }
  if (row.kind === "email" && row.email !== null) {
    return { kind: "email", email: row.email };
  }
  throw new CorruptExemptionRowError(row.id);
}

function withdrawnOf(row: OrderOpeningExemptionModel): ExemptionStamp | null {
  if (row.withdrawnAt === null) {
    return null;
  }
  return {
    at: row.withdrawnAt,
    author: {
      staffUserId: row.withdrawnByStaffId ?? "",
      name: row.withdrawnByName ?? "",
      role: row.withdrawnByRole ?? "",
    },
  };
}

/** Ligne → agrégat. */
export function exemptionToDomain(row: OrderOpeningExemptionModel): OrderOpeningExemption {
  return OrderOpeningExemption.rehydrate({
    id: row.id,
    target: targetOf(row),
    granted: {
      at: row.grantedAt,
      author: {
        staffUserId: row.grantedByStaffId,
        name: row.grantedByName,
        role: row.grantedByRole,
      },
    },
    withdrawn: withdrawnOf(row),
  });
}

/** Agrégat → ligne. */
export function exemptionToPersistence(
  exemption: OrderOpeningExemption,
): OrderOpeningExemptionModel {
  const { target, granted, withdrawn } = exemption;
  return {
    id: exemption.id,
    kind: target.kind,
    companyId: target.kind === "company" ? target.companyId : null,
    companyName: target.kind === "company" ? target.companyName : null,
    email: target.kind === "email" ? target.email : null,
    grantedAt: granted.at,
    grantedByStaffId: granted.author.staffUserId,
    grantedByName: granted.author.name,
    grantedByRole: granted.author.role,
    withdrawnAt: withdrawn?.at ?? null,
    withdrawnByStaffId: withdrawn?.author.staffUserId ?? null,
    withdrawnByName: withdrawn?.author.name ?? null,
    withdrawnByRole: withdrawn?.author.role ?? null,
  };
}

/** Ligne → vue de l'écran. */
export function exemptionToView(row: OrderOpeningExemptionModel): OrderOpeningExemptionView {
  const exemption = exemptionToDomain(row);
  return {
    id: exemption.id,
    kind: exemption.target.kind,
    companyId: exemption.target.kind === "company" ? exemption.target.companyId : null,
    label: exemption.label,
    grantedAt: exemption.granted.at.toISOString(),
    // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
    grantedBy: exemption.granted.author.name === "" ? null : exemption.granted.author.name,
  };
}
