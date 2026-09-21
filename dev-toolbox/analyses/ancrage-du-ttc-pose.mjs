/**
 * **Mesure D12** — une étiquette TTC POSÉE sur la plateforme est-elle encaissée
 * telle quelle ?
 *
 * Ouverte le 2026-09-21 pour
 * [`documentation/pim/plan-un-seul-canal-deux-prix.md`](../../documentation/pim/plan-un-seul-canal-deux-prix.md)
 * § D12, quand le lot a proposé une colonne « prix public TTC » modifiable.
 *
 * ```bash
 * pnpm --filter @lfd/money --filter @lfd/pim-contracts build
 * node dev-toolbox/analyses/ancrage-du-ttc-pose.mjs
 * ```
 *
 * 🔴 Elle importe le **CODE RÉEL**. Une contradiction avait estimé ces chiffres
 * en reproduisant l'arithmétique à la main ; le sens était juste, les comptes
 * non — recopier une formule mesure la copie.
 *
 * ## Ce qu'elle a établi, et qui a tranché une décision
 *
 * L'aller-retour TTC → HT → TTC ne revient pas toujours sur lui-même, **à taux
 * parfaitement fixe** : ce n'est pas le taux qui dérive. L'écart est toujours
 * d'exactement **un centime**, mais il est **systématiquement vers le haut** à
 * 10 % et à 20 %.
 *
 * D'où la décision (Hugo, 2026-09-21) : le prix posé est une **entrée**, et ce
 * qui s'affiche — écran du staff comme rayon public — est le TTC **encaissé**.
 * Un seul nombre, une seule façon de le produire.
 *
 * ⚠️ Quantité 1, sans remise ni frais : c'est le cas où l'écart se voit le
 * mieux et celui que le staff a sous les yeux quand il tape un prix. Une remise
 * ou des frais passent par la même ventilation et ne l'annulent pas.
 */
import { htMillicentsOf } from "../../packages/pim-contracts/dist/tax.js";
import { lineTotalCents, ventilateVat } from "../../packages/money/dist/index.js";

const RATES = [5.5, 10, 20];
const MAX = 2000;

for (const rate of RATES) {
  let bad = 0,
    up = 0,
    down = 0,
    worst = 0;
  const examples = [];
  for (let ttc = 1; ttc <= MAX; ttc += 1) {
    const ht = htMillicentsOf(ttc, rate);
    const htCents = lineTotalCents(ht, 1);
    const total = ventilateVat({
      lines: [{ htCents, vatRate: rate }],
      discountCents: 0,
      extras: [],
    }).totalCents;
    if (total !== ttc) {
      bad += 1;
      if (total > ttc) up += 1;
      else down += 1;
      worst = Math.max(worst, Math.abs(total - ttc));
      if (examples.length < 6) examples.push(`${ttc}→${total}`);
    }
  }
  console.log(
    `${rate} % : ${bad}/${MAX} non préservés (↑${up} ↓${down}), écart max ${worst} c — ${examples.join(", ")}`,
  );
}
