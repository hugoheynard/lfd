/**
 * **Ce que la TVA du coursier coûte au client** — 20 % en dur contre un port
 * traité en accessoire de la vente.
 *
 * Ouverte le 2026-09-21 pour
 * [`documentation/order/todo-tva-des-frais-de-port.md`](../../documentation/order/todo-tva-des-frais-de-port.md),
 * quand Hugo a demandé si le tarif par zone devait être ventilé selon le
 * contenu du panier.
 *
 * ```bash
 * pnpm --filter @lfd/money build
 * node dev-toolbox/analyses/tva-des-frais-de-port.mjs
 * ```
 *
 * 🔴 Elle importe le **CODE RÉEL** (`ventilateVat`), pas une arithmétique
 * recopiée : recopier une formule mesure la copie.
 *
 * Ce qu'elle a établi : sur 12 € de coursier, un panier de pâtisserie à 5,5 %
 * paie **1,74 € de TVA en trop**, et un panier mixte 1,30 €. L'écart est en
 * défaveur du client ET de la maison — il se déclare.
 */

import { ventilateVat } from "../../packages/money/dist/index.js";
const e = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

function dis(t, v) {
  console.log(
    `${t}\n  ${v.vat.map((s) => `TVA ${s.rate} % ${e(s.amountCents)}`).join(" · ")}\n  TOTAL ${e(v.totalCents)}\n`,
  );
}

const PORT = 1200; // 12,00 € HT de coursier

// ── Cas 1 : panier 100 % pâtisserie à 5,5 %
const p55 = [{ htCents: 4000, vatRate: 5.5 }];
dis(
  "① 40 € de pâtisserie + 12 € de port — AUJOURD'HUI (port à 20 %)",
  ventilateVat({ lines: p55, discountCents: 0, extras: [{ htCents: PORT, vatRate: 20 }] }),
);
dis(
  "② le même, port en ACCESSOIRE (suit la marchandise, 5,5 %)",
  ventilateVat({ lines: p55, discountCents: 0, extras: [{ htCents: PORT, vatRate: 5.5 }] }),
);

// ── Cas 2 : panier mixte — le port se ventile au prorata des bases HT
const mixte = [
  { htCents: 3000, vatRate: 5.5 },
  { htCents: 1000, vatRate: 20 },
];
dis(
  "③ 30 € à 5,5 % + 10 € à 20 % + 12 € de port — AUJOURD'HUI (port à 20 %)",
  ventilateVat({ lines: mixte, discountCents: 0, extras: [{ htCents: PORT, vatRate: 20 }] }),
);
// prorata : 3/4 du port à 5,5 %, 1/4 à 20 %
dis(
  "④ le même, port VENTILÉ au prorata (9 € à 5,5 %, 3 € à 20 %)",
  ventilateVat({
    lines: mixte,
    discountCents: 0,
    extras: [
      { htCents: 900, vatRate: 5.5 },
      { htCents: 300, vatRate: 20 },
    ],
  }),
);
