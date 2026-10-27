import { lineTotalCents } from "../millicents.js";
import { htMillicentsOf } from "../tax.js";
import { ventilateVat, type VatExtra, type VatVentilation } from "../vat.js";
import { ventilateVatExact, type ExactVatLine } from "../vat-exact.js";

/** Un HT rond : `euros` € HT en millicentimes (1 € = 100 000). */
function ht(euros: number, vatRate: number, extra: Partial<ExactVatLine> = {}): ExactVatLine {
  return { unitMillicents: euros * 100_000, quantity: 1, vatRate, ...extra };
}

function expectRecomposes(result: VatVentilation): void {
  expect(
    result.subtotalHtCents - result.discountCents + result.extrasHtCents + result.vatTotalCents,
  ).toBe(result.totalCents);
}

describe("ventilateVatExact — remises, chiffrées à la main", () => {
  /** 30 € HT, 10 % de remise retrait : 100 c sur le 5,5 %, 200 c sur le 20 %. */
  it("remise retrait 10 % sur deux taux : chaque taux perd sa part", () => {
    const result = ventilateVatExact({
      lines: [ht(10, 5.5), ht(20, 20)],
      eligibleDiscountCents: 300,
      discountCents: 0,
      extras: [],
    });

    // 9,00 × 1,055 = 9,495 → 9,50 (moitié vers le haut) ; 18,00 × 1,2 = 21,60.
    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 360 },
    ]);
    expect(result).toMatchObject({ discountCents: 300, vatTotalCents: 410, totalCents: 3110 });
    expectRecomposes(result);
  });

  it("bon partiel de 6 € sur trois taux : 2 € retranchés à chacun", () => {
    const result = ventilateVatExact({
      lines: [ht(10, 5.5), ht(10, 10), ht(10, 20)],
      discountCents: 600,
      extras: [],
    });

    // 8,00 € nets partout : TTC 8,44 / 8,80 / 9,60.
    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 44 },
      { rate: 10, amountCents: 80 },
      { rate: 20, amountCents: 160 },
    ]);
    expect(result.totalCents).toBe(2684);
    expectRecomposes(result);
  });

  /** Trois fois 0,33333 € = 0,99999 € exact, 1,00 € arrondi : la borne est le HT ARRONDI. */
  it("une remise qui atteint sa borne sur un seul taux solde tout, sans résidu de 0,00001 €", () => {
    const result = ventilateVatExact({
      lines: [{ unitMillicents: 33_333, quantity: 3, vatRate: 5.5 }],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(result).toMatchObject({ subtotalHtCents: 100, discountCents: 100, totalCents: 0 });
    expect(result.vat).toEqual([]);
  });

  it("un bon qui laisse 0,03 € de marchandise : HT 3 c, TVA 1 c, total 4 c", () => {
    const result = ventilateVatExact({
      lines: [ht(10, 20)],
      discountCents: 997,
      extras: [],
    });

    // 0,03 × 1,2 = 0,036 → 0,04.
    expect(result).toMatchObject({ discountCents: 997, vatTotalCents: 1, totalCents: 4 });
    expectRecomposes(result);
  });

  it("remise retrait + port qui suit la marchandise : le port se répartit au HT brut", () => {
    const result = ventilateVatExact({
      lines: [ht(10, 5.5), ht(10, 20)],
      eligibleDiscountCents: 200,
      discountCents: 0,
      extras: [{ htCents: 500, followsGoods: true }],
    });

    // 5,5 % : (9,00 + 2,50) × 1,055 = 12,1325 → 12,13 ; 20 % : 11,50 × 1,2 = 13,80.
    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 63 },
      { rate: 20, amountCents: 230 },
    ]);
    expect(result).toMatchObject({ extrasHtCents: 500, discountCents: 200, totalCents: 2593 });
    expectRecomposes(result);
  });
});

/** mulberry32 : graine fixe, jamais d'aléa non semé. */
function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATES = [5.5, 10, 20];

interface Basket {
  readonly lines: readonly ExactVatLine[];
  readonly eligibleDiscountCents: number;
  readonly discountCents: number;
  readonly extras: readonly VatExtra[];
}

function basket(random: () => number): Basket {
  const int = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
  const lines: ExactVatLine[] = Array.from({ length: int(1, 6) }, () => ({
    unitMillicents: htMillicentsOf(int(1, 3000), RATES[int(0, 2)] ?? 20) ?? 0,
    quantity: int(1, 6),
    vatRate: RATES[int(0, 2)] ?? 20,
    discountEligible: random() < 0.7,
  }));
  // Le taux de l'étiquette et celui de la ligne sont retirés séparément : sans importance ici.
  const gross = lines.reduce((acc, l) => acc + lineTotalCents(l.unitMillicents, l.quantity), 0);
  const extras: VatExtra[] = [];
  if (random() < 0.4) extras.push({ htCents: int(0, 800), followsGoods: true });
  if (random() < 0.3) extras.push({ htCents: int(0, 800), vatRate: RATES[int(0, 2)] ?? 20 });
  return {
    lines,
    eligibleDiscountCents: random() < 0.5 ? int(0, Math.ceil(gross * 1.2)) : 0,
    discountCents: random() < 0.5 ? int(0, Math.ceil(gross * 1.2)) : 0,
    extras,
  };
}

/** La TVA attendue d'un taux depuis le HT EXACT net (flottants : tolérance en bas). */
function exactVatByRate(b: Basket): Map<number, number> {
  const nets = b.lines.map((l) => (l.unitMillicents * l.quantity) / 1000);
  const rounded = b.lines.map((l) => lineTotalCents(l.unitMillicents, l.quantity));
  const eligible = b.lines.map((l) => l.discountEligible !== false);
  const sub = rounded.reduce((a, v) => a + v, 0);
  const eligAvail = rounded.reduce((a, v, i) => (eligible[i] ? a + v : a), 0);
  const eligApplied = Math.min(b.eligibleDiscountCents, eligAvail);
  const bonApplied = Math.min(b.discountCents, sub - eligApplied);
  const scale = (applied: number, scope: readonly boolean[], avail: number): void => {
    if (applied === 0) return;
    const base = nets.reduce((a, v, i) => (scope[i] ? a + v : a), 0);
    const factor = applied >= avail || applied >= base ? 0 : (base - applied) / base;
    nets.forEach((v, i) => {
      if (scope[i]) nets[i] = v * factor;
    });
  };
  scale(eligApplied, eligible, eligAvail);
  scale(
    bonApplied,
    eligible.map(() => true),
    sub - eligApplied,
  );

  const htByRate = new Map<number, number>();
  const grossByRate = new Map<number, number>();
  b.lines.forEach((l, i) => {
    htByRate.set(l.vatRate, (htByRate.get(l.vatRate) ?? 0) + (nets[i] ?? 0));
    grossByRate.set(l.vatRate, (grossByRate.get(l.vatRate) ?? 0) + (rounded[i] ?? 0));
  });
  const grossTotal = [...grossByRate.values()].reduce((a, v) => a + v, 0);
  for (const extra of b.extras) {
    if ("vatRate" in extra) {
      htByRate.set(extra.vatRate, (htByRate.get(extra.vatRate) ?? 0) + extra.htCents);
    } else if (grossTotal === 0) {
      htByRate.set(20, (htByRate.get(20) ?? 0) + extra.htCents);
    } else {
      for (const [rate, g] of grossByRate) {
        htByRate.set(rate, (htByRate.get(rate) ?? 0) + (extra.htCents * g) / grossTotal);
      }
    }
  }
  return new Map([...htByRate].map(([rate, v]) => [rate, (v * rate) / 100]));
}

const SWEEP = 4000;

describe("ventilateVatExact — balayage déterministe des remises", () => {
  const random = prng(20261027);
  const baskets = Array.from({ length: SWEEP }, () => basket(random));

  it("total = HT − remise + extras + TVA, sans TVA négative, remise ≤ assiette", () => {
    const failures: string[] = [];
    for (const b of baskets) {
      const r = ventilateVatExact(b);
      const sub = r.subtotalHtCents;
      const eligible = b.lines
        .filter((l) => l.discountEligible !== false)
        .reduce((a, l) => a + lineTotalCents(l.unitMillicents, l.quantity), 0);
      const recomposed = sub - r.discountCents + r.extrasHtCents + r.vatTotalCents;
      const bad =
        recomposed !== r.totalCents ||
        r.vat.some((s) => s.amountCents < 0) ||
        r.vat.reduce((a, s) => a + s.amountCents, 0) !== r.vatTotalCents ||
        r.discountCents > sub ||
        Math.min(b.eligibleDiscountCents, eligible) > r.discountCents;
      if (bad) failures.push(JSON.stringify({ b, r }));
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  // La TVA est la DIFFÉRENCE TTC − HT, et le HT du taux reste Σ des lignes
  // arrondies (objection B1) : elle absorbe l'arrondi de chaque ligne, soit
  // ~0,5 c par ligne du taux, plus 0,5 c pour celui du TTC (2,04 c mesurés à
  // 4 lignes, sans remise — 2026-10-27). C'est l'écart que le cabinet valide.
  it("chaque part de TVA reste à 1 c + 0,5 c par ligne du taux de (HT exact net × taux)", () => {
    const failures: string[] = [];
    for (const b of baskets) {
      const r = ventilateVatExact(b);
      const expected = exactVatByRate(b);
      const rates = new Set([...expected.keys(), ...r.vat.map((s) => s.rate)]);
      for (const rate of rates) {
        const got = r.vat.find((s) => s.rate === rate)?.amountCents ?? 0;
        if (Math.abs(got - (expected.get(rate) ?? 0)) > boundFor(b, rate)) {
          failures.push(JSON.stringify({ rate, got, exact: expected.get(rate), b }));
        }
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it("sans remise ni extras, le total est Σ quantité × étiquette", () => {
    const failures: string[] = [];
    const rnd = prng(7);
    for (let i = 0; i < SWEEP; i++) {
      const labelled = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => {
        const rate = RATES[Math.floor(rnd() * 3)] ?? 20;
        const cents = 1 + Math.floor(rnd() * 3000);
        return { cents, quantity: 1 + Math.floor(rnd() * 6), rate };
      });
      const lines = labelled.map((l) => ({
        unitMillicents: htMillicentsOf(l.cents, l.rate) ?? 0,
        quantity: l.quantity,
        vatRate: l.rate,
      }));
      const expected = labelled.reduce((a, l) => a + l.cents * l.quantity, 0);
      const got = ventilateVatExact({ lines, discountCents: 0, extras: [] }).totalCents;
      if (got !== expected) failures.push(JSON.stringify({ labelled, got, expected }));
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it("tout couvert : les marchandises ne coûtent rien, TVA comprise", () => {
    const failures: string[] = [];
    for (const b of baskets) {
      const r = ventilateVatExact({
        lines: b.lines,
        eligibleDiscountCents: 1_000_000,
        discountCents: 1_000_000,
        extras: [],
      });
      if (r.totalCents !== 0 || r.vat.length !== 0) failures.push(JSON.stringify({ b, r }));
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  // Même cause : le HT est celui du pro, seul le TTC diffère — de 2 c dès trois
  // lignes d'un même taux, dans les deux sens (mesuré le 2026-10-27).
  it("sans remise, l'écart par taux avec ventilateVat reste dans la même borne", () => {
    const failures: string[] = [];
    for (const b of baskets) {
      const input = { lines: b.lines, discountCents: 0, extras: b.extras };
      const exact = ventilateVatExact(input);
      const legacy = ventilateVat({
        lines: b.lines.map((l) => ({
          htCents: lineTotalCents(l.unitMillicents, l.quantity),
          vatRate: l.vatRate,
        })),
        discountCents: 0,
        extras: b.extras,
      });
      const rates = new Set([...exact.vat, ...legacy.vat].map((s) => s.rate));
      for (const rate of rates) {
        const a = exact.vat.find((s) => s.rate === rate)?.amountCents ?? 0;
        const c = legacy.vat.find((s) => s.rate === rate)?.amountCents ?? 0;
        if (Math.abs(a - c) > boundFor(b, rate)) failures.push(JSON.stringify({ rate, a, c, b }));
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });
});

/**
 * L'écart admis sur la TVA d'un taux : 1 c, plus 0,5 c par ligne de ce taux
 * (l'arrondi de chaque HT de ligne), plus 1 c par terme réparti entre les taux
 * (remise retrait, bon, port qui suit) — chacun découpé en centimes entiers au
 * plus fort reste, comme `splitOrderByRate`.
 */
function boundFor(basket: Basket, rate: number): number {
  const lines = basket.lines.filter((line) => line.vatRate === rate).length;
  const spread =
    ((basket.eligibleDiscountCents ?? 0) > 0 ? 1 : 0) +
    (basket.discountCents > 0 ? 1 : 0) +
    basket.extras.filter((extra) => "followsGoods" in extra).length;
  return 1 + 0.5 * lines + spread;
}
