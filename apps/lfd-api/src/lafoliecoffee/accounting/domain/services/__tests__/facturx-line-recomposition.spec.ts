import { renderFacturXml } from "../facturx-xml.js";
import { facturXSamples } from "./facturx-samples.js";

/**
 * **Chaque ligne émise se recompose : BT-129 × BT-146 ≈ BT-131** (Peppol
 * PEPPOL-EN16931-R120, tolérance 0,02 €), et les lignes recomposées tombent
 * sur les totaux de taux (BT-116).
 *
 * Régression : deux témoins (`carte-acquittee`, `plusieurs-taux-remise-
 * livraison`) portaient un prix net de 5,00 € quel que soit le montant de la
 * ligne — la fixture `line()` fixe le prix, et ces témoins appelaient
 * `Invoice.issue` sans passer par `billedUnitPriceMillicents`. Le Schematron
 * CEN n'a pas R120 et `facturXArithmeticViolations` ne lit que BT-131 : seul
 * Mustang, qui recalcule les lignes depuis le prix, l'a vu (2026-11-01).
 */

/** 10⁻⁵ € : l'échelle la plus fine que le rendu écrit (prix au millicentime). */
const PRICE_DECIMALS = 5;
const QUANTITY_DECIMALS = 3;
/** 0,02 € à l'échelle prix × quantité (10⁻⁸ €). */
const R120_TOLERANCE = 2n * 10n ** BigInt(PRICE_DECIMALS + QUANTITY_DECIMALS - 2);

function scaled(raw: string | undefined, decimals: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(raw ?? "");
  if (match === null) {
    throw new TypeError(`décimal illisible : « ${raw ?? "absent"} »`);
  }
  const fraction = (match[3] ?? "").padEnd(decimals, "0");
  if (fraction.length > decimals) {
    throw new TypeError(`trop de décimales : « ${raw ?? ""} »`);
  }
  const magnitude = BigInt(`${match[2] ?? "0"}${fraction}`);
  return match[1] === "-" ? -magnitude : magnitude;
}

function inner(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "u").exec(block)?.[1];
}

interface EmittedLine {
  readonly rate: string;
  /** BT-129 × BT-146, en 10⁻⁸ €. */
  readonly recomposed: bigint;
  /** BT-131, en 10⁻⁸ €. */
  readonly written: bigint;
}

function emittedLines(xml: string): readonly EmittedLine[] {
  const items = xml.match(
    /<ram:IncludedSupplyChainTradeLineItem>[\s\S]*?<\/ram:IncludedSupplyChainTradeLineItem>/gu,
  );
  return (items ?? []).map((item) => {
    const net = inner(inner(item, "ram:NetPriceProductTradePrice") ?? "", "ram:ChargeAmount");
    const quantity = inner(item, "ram:BilledQuantity");
    const total = inner(item, "ram:LineTotalAmount");
    return {
      rate: inner(item, "ram:RateApplicablePercent") ?? "",
      recomposed: scaled(net, PRICE_DECIMALS) * scaled(quantity, QUANTITY_DECIMALS),
      written: scaled(total, 2) * 10n ** BigInt(PRICE_DECIMALS + QUANTITY_DECIMALS - 2),
    };
  });
}

function distance(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

describe("Factur-X — chaque ligne émise se recompose depuis son prix", () => {
  it.each(facturXSamples().map((s) => [s.name, s.invoice] as const))(
    "%s : |BT-129 × BT-146 − BT-131| ≤ 0,02 € sur chaque ligne",
    (_name, invoice) => {
      const lines = emittedLines(renderFacturXml(invoice));
      expect(lines.length).toBeGreaterThan(0);
      // Les écarts en texte : Jest ne sait pas sérialiser un `bigint`.
      const gaps = lines
        .filter((l) => distance(l.recomposed, l.written) > R120_TOLERANCE)
        .map((l) => `${l.rate} % : ${String(l.recomposed)} ≠ ${String(l.written)} (10⁻⁸ €)`);
      expect(gaps).toEqual([]);
    },
  );

  it.each(facturXSamples().map((s) => [s.name, s.invoice] as const))(
    "%s : les lignes recomposées tombent sur leurs montants écrits, taux par taux",
    (_name, invoice) => {
      const lines = emittedLines(renderFacturXml(invoice));
      const rates = [...new Set(lines.map((l) => l.rate))];
      for (const rate of rates) {
        const atRate = lines.filter((l) => l.rate === rate);
        const recomposed = atRate.reduce((sum, l) => sum + l.recomposed, 0n);
        const written = atRate.reduce((sum, l) => sum + l.written, 0n);
        const within = distance(recomposed, written) <= R120_TOLERANCE * BigInt(atRate.length);
        expect({ rate, within, recomposed: String(recomposed), written: String(written) }).toEqual({
          rate,
          within: true,
          recomposed: String(recomposed),
          written: String(written),
        });
      }
    },
  );
});
