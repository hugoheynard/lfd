/**
 * **Les règles arithmétiques EN 16931**, rejouées sur le XML Factur-X que
 * `renderFacturXml` écrit — sans parseur ni dépendance : une lecture par
 * balises, suffisante pour CE rendu (aucun élément lu ici ne s'imbrique dans
 * lui-même), PAS pour un XML venu d'ailleurs.
 *
 * Ce qui est rejoué : BR-CO-10 à BR-CO-16, BR-S-08 et BR-S-09 (arrondi au
 * centime près, quel que soit le sens d'arrondi). Ce qui ne l'est PAS
 * (2026-10-08) : tout le reste du Schematron CEN — présence et cardinalité
 * des éléments, listes de codes, identifiants, cohérence des catégories de
 * TVA avec les numéros de TVA (BR-S-02…), et le schéma XSD lui-même. Ils
 * attendent le Schematron officiel (lot E3b).
 *
 * Rend la liste des violations, vide quand tout tombe juste.
 */
export function facturXArithmeticViolations(xml: string): readonly string[] {
  const header = blocks(xml, "ram:ApplicableHeaderTradeSettlement")[0];
  if (header === undefined) {
    return ["règlement d'en-tête absent"];
  }
  const totals = blocks(header, "ram:SpecifiedTradeSettlementHeaderMonetarySummation")[0] ?? "";
  const read = new AmountReader();
  const lines = blocks(xml, "ram:IncludedSupplyChainTradeLineItem").map((item) => ({
    amount: read.cents(item, "ram:LineTotalAmount"),
    rate: read.basisPoints(item, "ram:RateApplicablePercent"),
  }));
  const parts = blocks(header, "ram:SpecifiedTradeAllowanceCharge").map((part) => ({
    isCharge: valueOf(part, "udt:Indicator") === "true",
    amount: read.cents(part, "ram:ActualAmount"),
    rate: read.basisPoints(part, "ram:RateApplicablePercent"),
  }));
  const taxes = blocks(header, "ram:ApplicableTradeTax").map((tax) => ({
    vat: read.cents(tax, "ram:CalculatedAmount"),
    base: read.cents(tax, "ram:BasisAmount"),
    rate: read.basisPoints(tax, "ram:RateApplicablePercent"),
  }));
  const sums: Summation = {
    lines: read.cents(totals, "ram:LineTotalAmount"),
    charges: read.cents(totals, "ram:ChargeTotalAmount"),
    allowances: read.cents(totals, "ram:AllowanceTotalAmount"),
    taxBasis: read.cents(totals, "ram:TaxBasisTotalAmount"),
    tax: read.cents(totals, "ram:TaxTotalAmount"),
    grand: read.cents(totals, "ram:GrandTotalAmount"),
    due: read.cents(totals, "ram:DuePayableAmount"),
  };
  return [
    ...read.errors,
    ...documentRules(sums, lines, parts, taxes),
    ...taxes.flatMap((tax) => rateRules(tax, lines, parts)),
  ];
}

interface Summation {
  readonly lines: number;
  readonly charges: number;
  readonly allowances: number;
  readonly taxBasis: number;
  readonly tax: number;
  readonly grand: number;
  readonly due: number;
}

interface Rated {
  readonly amount: number;
  readonly rate: number;
}

interface AllowanceCharge extends Rated {
  readonly isCharge: boolean;
}

interface TaxSubtotal {
  readonly vat: number;
  readonly base: number;
  readonly rate: number;
}

const HUNDREDTHS = 100;
const BASIS_POINTS_SCALE = 10_000;
/** Une demi-unité de centime, à l'échelle centimes × points de base. */
const HALF_CENT_SCALED = BASIS_POINTS_SCALE / 2;

function documentRules(
  sums: Summation,
  lines: readonly Rated[],
  parts: readonly AllowanceCharge[],
  taxes: readonly TaxSubtotal[],
): readonly string[] {
  const rules: readonly (readonly [string, number, number])[] = [
    ["BR-CO-10 Σ BT-131 = BT-106", total(lines.map((l) => l.amount)), sums.lines],
    ["BR-CO-11 Σ BT-92 = BT-107", total(amountsOf(parts, false)), sums.allowances],
    ["BR-CO-12 Σ BT-99 = BT-108", total(amountsOf(parts, true)), sums.charges],
    [
      "BR-CO-13 BT-109 = BT-106 − BT-107 + BT-108",
      sums.lines - sums.allowances + sums.charges,
      sums.taxBasis,
    ],
    ["BR-CO-14 Σ BT-117 = BT-110", total(taxes.map((t) => t.vat)), sums.tax],
    ["BR-CO-15 BT-112 = BT-109 + BT-110", sums.taxBasis + sums.tax, sums.grand],
    ["BR-CO-16 BT-115 = BT-112 (ni acompte ni arrondi)", sums.grand, sums.due],
  ];
  return rules
    .filter(([, expected, written]) => expected !== written)
    .map(
      ([rule, expected, written]) =>
        `${rule} : attendu ${String(expected)} c, écrit ${String(written)} c`,
    );
}

/** BR-S-08 (base du taux) et BR-S-09 (TVA = base × taux, au centime près). */
function rateRules(
  tax: TaxSubtotal,
  lines: readonly Rated[],
  parts: readonly AllowanceCharge[],
): readonly string[] {
  const atRate = <T extends Rated>(items: readonly T[]): readonly T[] =>
    items.filter((item) => item.rate === tax.rate);
  const ratedParts = atRate(parts);
  const expectedBase =
    total(atRate(lines).map((l) => l.amount)) -
    total(amountsOf(ratedParts, false)) +
    total(amountsOf(ratedParts, true));
  const violations: string[] = [];
  const label = `taux ${String(tax.rate)} pb`;
  if (expectedBase !== tax.base) {
    violations.push(
      `BR-S-08 ${label} : base attendue ${String(expectedBase)} c, écrite ${String(tax.base)} c`,
    );
  }
  if (Math.abs(tax.vat * BASIS_POINTS_SCALE - tax.base * tax.rate) > HALF_CENT_SCALED) {
    violations.push(
      `BR-S-09 ${label} : TVA ${String(tax.vat)} c ≠ arrondi(${String(tax.base)} c × taux)`,
    );
  }
  return violations;
}

function amountsOf(parts: readonly AllowanceCharge[], isCharge: boolean): readonly number[] {
  return parts.filter((part) => part.isCharge === isCharge).map((part) => part.amount);
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/** Lit des décimaux en entiers (centimes, points de base) et garde ce qui est illisible. */
class AmountReader {
  readonly errors: string[] = [];

  cents(block: string, tag: string): number {
    return this.scaled(block, tag);
  }

  basisPoints(block: string, tag: string): number {
    return this.scaled(block, tag);
  }

  /** Deux décimales exactement, lues sans flottant : `12.34` → 1234. */
  private scaled(block: string, tag: string): number {
    const raw = valueOf(block, tag);
    const match = /^(-?)(\d+)\.(\d{2})$/u.exec(raw ?? "");
    if (match === null) {
      this.errors.push(`${tag} illisible : « ${raw ?? "absent"} »`);
      return 0;
    }
    const magnitude = Number(match[2]) * HUNDREDTHS + Number(match[3]);
    return match[1] === "-" ? -magnitude : magnitude;
  }
}

function blocks(xml: string, tag: string): readonly string[] {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gu");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function valueOf(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "u").exec(block);
  return match?.[1] ?? null;
}
