import type { AdminBackorderView } from "@lfd/contracts";

import type { Prisma } from "../../../../platform/database/client/client.js";
import { BACKORDER_SELECT, backorderOf } from "./backorder.mapper.js";

/** Le reliquat, son origine (numéro, noms figés, société, acheteur) et sa commande issue. */
export const BACKORDER_VIEW_SELECT = {
  ...BACKORDER_SELECT,
  originOrder: {
    select: {
      orderNumber: true,
      company: { select: { raisonSociale: true, enseigne: true } },
      placedBy: { select: { firstName: true, lastName: true, email: true } },
      lines: { select: { sku: true, productNameSnapshot: true } },
    },
  },
  convertedOrder: { select: { orderNumber: true } },
} as const satisfies Prisma.BackorderSelect;

export type BackorderViewRow = Prisma.BackorderGetPayload<{
  select: typeof BACKORDER_VIEW_SELECT;
}>;

/**
 * La ligne → la vue de l'équipe. L'état et les lignes passent par l'agrégat
 * (`backorderOf`) : une ligne mal formée est refusée ici comme à l'écriture.
 */
export function backorderViewOf(row: BackorderViewRow): AdminBackorderView {
  const state = backorderOf(row).toSnapshot();
  const origin = row.originOrder;
  const names = new Map(origin.lines.map((line) => [line.sku, line.productNameSnapshot]));
  return {
    id: state.id,
    state: state.state,
    createdAt: state.createdAt.toISOString(),
    origin: { orderId: state.originOrderId, orderNumber: origin.orderNumber },
    company:
      state.companyId === null
        ? null
        : { id: state.companyId, name: companyNameOf(origin.company) },
    buyer: { userId: state.buyerUserId, name: personNameOf(origin.placedBy) },
    lines: state.lines.map((line) => ({
      sku: line.sku,
      productName: names.get(line.sku) ?? line.sku,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
    })),
    convertedOrder:
      state.convertedOrderId === null || row.convertedOrder === null
        ? null
        : { orderId: state.convertedOrderId, orderNumber: row.convertedOrder.orderNumber },
    closedAt: state.closedAt?.toISOString() ?? null,
  };
}

/** L'enseigne quand elle existe, la raison sociale sinon. */
function companyNameOf(
  company: { readonly raisonSociale: string; readonly enseigne: string } | null,
): string {
  if (company === null) {
    return "";
  }
  const trade = company.enseigne.trim();
  return trade === "" ? company.raisonSociale : trade;
}

/** « Prénom Nom », ou l'identifiant de connexion quand la fiche n'a pas de nom. */
function personNameOf(person: {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name === "" ? person.email : name;
}
