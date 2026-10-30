import type { MadeToOrderByClientView, MadeToOrderClient, MadeToOrderMonth } from "@lfd/contracts";

import type { MadeToOrderClientLine } from "../ports/made-to-order-client.reader.js";
import type { MadeToOrderMonthTally } from "../ports/made-to-order-monthly.reader.js";

/**
 * **Le rapport mensuel** : un rang par mois demandé, vide compris. Une ligne
 * d'avant le suivi a son propre montant — jamais ajoutée au « non sur
 * mesure ». La part se rapporte au HT de TOUTES les lignes du mois.
 */
export function monthlyRowsOf(
  months: readonly string[],
  tallies: readonly MadeToOrderMonthTally[],
): readonly MadeToOrderMonth[] {
  return months.map((month) => {
    const ofMonth = tallies.filter((tally) => tally.month === month);
    const sum = (state: boolean | null): number =>
      ofMonth
        .filter((tally) => tally.madeToOrder === state)
        .reduce((total, tally) => total + tally.htCents, 0);
    const madeToOrderHtCents = sum(true);
    const otherHtCents = sum(false);
    const unknownHtCents = sum(null);
    const totalHtCents = madeToOrderHtCents + otherHtCents + unknownHtCents;
    return {
      month,
      madeToOrderHtCents,
      otherHtCents,
      unknownHtCents,
      totalHtCents,
      madeToOrderOrders: ofMonth.find((tally) => tally.madeToOrder === true)?.orders ?? 0,
      madeToOrderShare: totalHtCents === 0 ? null : madeToOrderHtCents / totalHtCents,
    };
  });
}

/** Un client en cours d'assemblage. */
type ClientDraft = { -readonly [K in keyof MadeToOrderClient]: MadeToOrderClient[K] } & {
  articles: MadeToOrderClient["articles"][number][];
};

function draftOf(line: MadeToOrderClientLine): ClientDraft {
  return {
    clientKey: line.clientKey,
    kind: line.kind,
    companyId: line.companyId,
    name: line.name,
    principalName: line.principalName,
    madeToOrderHtCents: 0,
    articles: [],
    unknownHtCents: 0,
  };
}

function byWeight(a: MadeToOrderClient, b: MadeToOrderClient): number {
  return (
    b.madeToOrderHtCents - a.madeToOrderHtCents ||
    b.unknownHtCents - a.unknownHtCents ||
    a.name.localeCompare(b.name, "fr")
  );
}

/**
 * **Le rapport par client** : les articles sur mesure de chaque client, par
 * HT décroissant, et le HT de ses lignes d'avant le suivi à part.
 */
export function byClientReportOf(
  from: string,
  to: string,
  lines: readonly MadeToOrderClientLine[],
): MadeToOrderByClientView {
  const clients = new Map<string, ClientDraft>();
  for (const line of lines) {
    const client = clients.get(line.clientKey) ?? draftOf(line);
    clients.set(line.clientKey, client);
    if (line.madeToOrder === null) {
      client.unknownHtCents += line.htCents;
      continue;
    }
    client.madeToOrderHtCents += line.htCents;
    client.articles.push({
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      quantity: line.quantity,
      htCents: line.htCents,
      orders: line.orders,
    });
  }
  const ranked = [...clients.values()]
    .map((client) => ({
      ...client,
      articles: [...client.articles].sort(
        (a, b) => b.htCents - a.htCents || a.sku.localeCompare(b.sku),
      ),
    }))
    .sort(byWeight);
  return {
    from,
    to,
    madeToOrderHtCents: ranked.reduce((total, client) => total + client.madeToOrderHtCents, 0),
    unknownHtCents: ranked.reduce((total, client) => total + client.unknownHtCents, 0),
    clients: ranked,
  };
}
