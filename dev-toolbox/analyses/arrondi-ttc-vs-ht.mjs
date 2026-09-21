/**
 * **Mesure D6** — l'étiquette TTC survit-elle à la chaîne de calcul ?
 *
 * Ouverte le 2026-09-21 pour
 * [`documentation/pim/plan-un-seul-canal-deux-prix.md`](../../documentation/pim/plan-un-seul-canal-deux-prix.md) § A.4.
 *
 * ## Pourquoi un script et pas un chiffre dans un document
 *
 * Le chiffre a renversé la décision : l'option qu'on s'apprêtait à recommander
 * ne corrigeait **rien**. Un nombre recopié dans une prose ne se vérifie plus,
 * et celui-ci porte une décision d'argent — il doit pouvoir être **rejoué** le
 * jour où quelqu'un doute, ou le jour où `ventilateVat` change.
 *
 * ```bash
 * pnpm --filter @lfd/money --filter @lfd/pim-contracts build
 * node dev-toolbox/analyses/arrondi-ttc-vs-ht.mjs
 * ```
 *
 * 🔴 Elle importe le **CODE RÉEL** — `htMillicentsOf` et `htFromTtc` du
 * référentiel, `lineTotalCents` et `ventilateVat` de `@lfd/money`. Une mesure
 * qui recopierait l'arithmétique mesurerait la copie.
 *
 * ## Les trois options
 *
 * - **A — le HT fait foi** (le code d'aujourd'hui) : étiquette → HT unitaire en
 *   millicentimes → × quantité → arrondi au centime → ventilation.
 * - **B — le TTC fait foi au départ** : le total de ligne est `étiquette ×
 *   quantité` (exact), le HT s'en déduit, puis ventilation.
 * - **C — le TTC est PORTÉ** : la TVA se déduit par **soustraction**
 *   (`TTC − HT`) au lieu d'être multipliée puis arrondie.
 *
 * ## Le résultat, et ce qu'il apprend
 *
 * **A et B rendent exactement les mêmes écarts.** Le point de départ n'y change
 * rien : `ventilateVat` termine toujours par `HT + arrondi(HT × taux)`, et tant
 * que la dernière opération est une multiplication arrondie, l'étiquette ne peut
 * pas être tenue. Seule C tombe juste, et par construction.
 *
 * ⚠️ **C est modélisée ici, pas implémentée.** Ce qui est démontré est que
 * l'APPROCHE est exacte — il reste à en faire une jumelle de `ventilateVat`
 * dans `@lfd/money`, tenue par ses propres tests.
 */
import { htFromTtc, htMillicentsOf } from "../../packages/pim-contracts/dist/tax.js";
import { lineTotalCents, ventilateVat } from "../../packages/money/dist/index.js";

/** Les trois taux de la carte française qui nous concernent. */
const RATES = [5.5, 10, 20];

/** Un tirage reproductible : une mesure qui change à chaque lancement ne prouve rien. */
function generator(seed) {
  let state = seed;
  return (n) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % n;
  };
}

/** Ce que le client additionne dans sa tête. */
const expectedTtc = (items) => items.reduce((sum, it) => sum + it.ttcCents * it.qty, 0);

/** A — l'arrondi a lieu au total de ligne, depuis un unitaire en millicentimes. */
const linesA = (items) =>
  items.map((it) => ({
    htCents: lineTotalCents(htMillicentsOf(it.ttcCents, it.rate), it.qty),
    vatRate: it.rate,
  }));

/** B — le total de ligne est exact en TTC, le HT s'en déduit. */
const linesB = (items) =>
  items.map((it) => ({ htCents: htFromTtc(it.ttcCents * it.qty, it.rate), vatRate: it.rate }));

const totalOf = (lines, discountCents = 0) =>
  ventilateVat({ lines, discountCents, extras: [] }).totalCents;

/**
 * C — le TTC est porté, la TVA se déduit par soustraction.
 *
 * Le groupement **par taux** n'est pas un détail : `ventilateVat` promet « un
 * seul arrondi par taux », et une jumelle qui arrondirait ligne par ligne
 * perdrait la propriété qui fait qu'une facture de trente lignes retombe sur
 * elle-même.
 */
function totalC(items, discountBp = 0) {
  const byRate = new Map();
  for (const it of items) {
    byRate.set(it.rate, (byRate.get(it.rate) ?? 0) + it.ttcCents * it.qty);
  }
  let total = 0;
  for (const [, ttcGroup] of byRate) {
    total += ttcGroup - Math.round((ttcGroup * discountBp) / 10_000);
  }
  return total;
}

/** L'attendu sous remise : la même règle, annoncée en TTC. */
function expectedWithDiscount(items, discountBp) {
  const byRate = new Map();
  for (const it of items) {
    byRate.set(it.rate, (byRate.get(it.rate) ?? 0) + it.ttcCents * it.qty);
  }
  return [...byRate.values()].reduce(
    (sum, ttc) => sum + (ttc - Math.round((ttc * discountBp) / 10_000)),
    0,
  );
}

function randomBasket(rnd, maxLines) {
  const items = [];
  for (let l = 0, k = 1 + rnd(maxLines); l < k; l++) {
    items.push({ ttcCents: 50 + rnd(2950), rate: RATES[rnd(RATES.length)], qty: 1 + rnd(12) });
  }
  return items;
}

const pct = (n, d) => `${((n / d) * 100).toFixed(2)} %`;
const row = (label, bad, n, worst) =>
  `  ${label.padEnd(24)} ${String(bad).padStart(7)} / ${n.toLocaleString("fr")}` +
  `  (${pct(bad, n).padStart(7)})` +
  (worst === undefined ? "" : `   pire : ${worst} centime(s)`);

// --- CAS 1 : une ligne, sans remise ni frais. La question pure. -------------
{
  const bad = { A: 0, B: 0, C: 0 };
  const worst = { A: 0, B: 0 };
  let n = 0;
  let sample = null;

  for (const rate of RATES) {
    for (let ttc = 50; ttc <= 3000; ttc++) {
      for (let qty = 1; qty <= 24; qty++) {
        const items = [{ ttcCents: ttc, rate, qty }];
        const attendu = expectedTtc(items);
        n += 1;

        for (const [name, lines] of [
          ["A", linesA(items)],
          ["B", linesB(items)],
        ]) {
          const gap = totalOf(lines) - attendu;
          if (gap !== 0) {
            bad[name] += 1;
            if (Math.abs(gap) > Math.abs(worst[name])) worst[name] = gap;
            if (sample === null && qty === 1)
              sample = { rate, ttc, attendu, obtenu: attendu + gap };
          }
        }
        if (totalC(items) !== attendu) bad.C += 1;
      }
    }
  }

  console.log("\n═══ CAS 1 — une ligne, sans remise ni frais ═══\n");
  console.log(row("A — le HT fait foi", bad.A, n, worst.A));
  console.log(row("B — TTC au départ", bad.B, n, worst.B));
  console.log(row("C — TVA par soustraction", bad.C, n));
  if (sample) {
    console.log(
      `\n  ex. ${sample.rate} % · étiquette ${(sample.ttc / 100).toFixed(2)} € × 1` +
        ` → attendu ${(sample.attendu / 100).toFixed(2)} €,` +
        ` encaissé ${(sample.obtenu / 100).toFixed(2)} €`,
    );
  }
  console.log("\n  🔴 A et B sont IDENTIQUES : le point de départ n'y change rien.");
}

// --- CAS 2 : panier réel, taux mélangés, sans remise. -----------------------
{
  const rnd = generator(20260921);
  const bad = { A: 0, B: 0, C: 0 };
  const worst = { A: 0, B: 0 };
  const n = 200_000;

  for (let i = 0; i < n; i++) {
    const items = randomBasket(rnd, 6);
    const attendu = expectedTtc(items);
    for (const [name, lines] of [
      ["A", linesA(items)],
      ["B", linesB(items)],
    ]) {
      const gap = totalOf(lines) - attendu;
      if (gap !== 0) {
        bad[name] += 1;
        if (Math.abs(gap) > Math.abs(worst[name])) worst[name] = gap;
      }
    }
    if (totalC(items) !== attendu) bad.C += 1;
  }

  console.log("\n═══ CAS 2 — panier réel, taux mélangés ═══\n");
  console.log(row("A — le HT fait foi", bad.A, n, worst.A));
  console.log(row("B — TTC au départ", bad.B, n, worst.B));
  console.log(row("C — TVA par soustraction", bad.C, n));
}

// --- CAS 3 : avec une remise de 5 %. ---------------------------------------
{
  const rnd = generator(7770001);
  const bad = { A: 0, B: 0, C: 0 };
  const n = 200_000;
  const DISCOUNT_BP = 500;

  for (let i = 0; i < n; i++) {
    const items = randomBasket(rnd, 4);
    const attendu = expectedWithDiscount(items, DISCOUNT_BP);
    for (const [name, lines] of [
      ["A", linesA(items)],
      ["B", linesB(items)],
    ]) {
      const subtotal = lines.reduce((s, l) => s + l.htCents, 0);
      if (totalOf(lines, Math.round((subtotal * DISCOUNT_BP) / 10_000)) !== attendu) bad[name] += 1;
    }
    if (totalC(items, DISCOUNT_BP) !== attendu) bad.C += 1;
  }

  console.log("\n═══ CAS 3 — avec une remise de 5 % ═══\n");
  console.log(row("A — le HT fait foi", bad.A, n));
  console.log(row("B — TTC au départ", bad.B, n));
  console.log(row("C — TVA par soustraction", bad.C, n));
  console.log(
    "\n  ⚠️ C ne tombe juste QU'À UNE CONDITION : que la remise soit annoncée\n" +
      "     en TTC. Elle est aujourd'hui posée sur le HT — et les deux bases ne\n" +
      "     peuvent pas tomber juste en même temps. C'est une décision, pas un\n" +
      "     arrondi.",
  );
}

// ===========================================================================
// LA DÉRIVE ACCEPTÉE (D6) — s'accumule-t-elle, et est-elle orientée ?
//
// Deux questions distinctes une fois D6 tranchée, et c'est la seconde qui
// décide de ce que le comptable rattrape.
// ===========================================================================

const driftOf = (ttcCents, rate, qty) =>
  totalOf([{ htCents: lineTotalCents(htMillicentsOf(ttcCents, rate), qty), vatRate: rate }]) -
  ttcCents * qty;

console.log("\n═══ D6 — la dérive s'accumule-t-elle avec la quantité ? ═══\n");

for (const [ttc, rate] of [
  [67, 5.5],
  [120, 5.5],
  [250, 10],
  [199, 20],
]) {
  let worst = 0;
  const first12 = [];
  for (let qty = 1; qty <= 1000; qty++) {
    const d = driftOf(ttc, rate, qty);
    if (Math.abs(d) > Math.abs(worst)) worst = d;
    if (qty <= 12) first12.push(d > 0 ? `+${d}` : String(d));
  }
  console.log(
    `  ${(ttc / 100).toFixed(2)} € à ${String(rate).padStart(4)} %  ·  q1→q12 : [${first12.join(" ")}]` +
      `  ·  pire jusqu'à q=1000 : ${worst > 0 ? "+" : ""}${worst} c`,
  );
}

console.log(
  "\n  → NON. Elle oscille entre -1, 0 et +1 et reste bornée à 1 centime même à\n" +
    "    la quantité 1000. C'est une propriété de la chaîne : UN SEUL arrondi, au\n" +
    "    total de ligne, avec le prix unitaire gardé en millicentimes en amont.\n" +
    "    `millicents.ts` le dit — « l'arrondir ici multiplierait l'erreur par la\n" +
    "    quantité commandée ».",
);

console.log("\n═══ D6 — mais est-elle ORIENTÉE ? (oui, et c'est le vrai sujet) ═══\n");

for (const rate of RATES) {
  const counts = { "-1": 0, 0: 0, "+1": 0 };
  let sum = 0;
  let n = 0;
  // Et d'où vient le biais : de l'arrondi du TOTAL DE LIGNE, ou de la TVA ?
  let lineUp = 0;
  let lineDown = 0;
  let vatUp = 0;
  let vatDown = 0;
  for (let ttc = 50; ttc <= 3000; ttc++) {
    for (let qty = 1; qty <= 24; qty++) {
      const d = driftOf(ttc, rate, qty);
      counts[d > 0 ? "+1" : d < 0 ? "-1" : "0"] += 1;
      sum += d;
      n += 1;

      const exactHt = (ttc * qty) / (1 + rate / 100);
      const ht = lineTotalCents(htMillicentsOf(ttc, rate), qty);
      if (ht > exactHt + 1e-9) lineUp += 1;
      else if (ht < exactHt - 1e-9) lineDown += 1;
      const exactVat = ht * (rate / 100);
      const vat = Math.round(exactVat);
      if (vat > exactVat + 1e-9) vatUp += 1;
      else if (vat < exactVat - 1e-9) vatDown += 1;
    }
  }
  const p = (x) => `${((x / n) * 100).toFixed(2).padStart(5)} %`;
  console.log(
    `  ${String(rate).padStart(5)} %  ·  -1 c : ${p(counts["-1"])}   juste : ${p(counts["0"])}   ` +
      `+1 c : ${p(counts["+1"])}   ·  ${(sum / n).toFixed(4)} c/ligne`,
  );
  console.log(
    `            source du biais → total de ligne ↑ ${p(lineUp)} / ↓ ${p(lineDown)}` +
      `   ·   TVA ↑ ${p(vatUp)} / ↓ ${p(vatDown)}`,
  );
}

console.log(
  "\n  → Le biais vient de l'arrondi de la TVA, PAS de celui du total de ligne.\n" +
    "    À 10 %, la ligne arrondit symétriquement et la TVA monte une fois sur\n" +
    "    deux. Le supprimer demanderait un arrondi au demi-pair — qui changerait\n" +
    "    la façon dont TOUT l'argent du dépôt arrondit, factures B2B comprises.",
);
