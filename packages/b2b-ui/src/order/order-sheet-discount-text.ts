import type { SheetMoney } from '@lfd/contracts';

import { formatCents } from './order-format';

/** La largeur d'une ligne du décompte texte : « ␣␣Remise␣… » puis le montant. */
const GESTURE_LINE_WIDTH = 42;

/**
 * **Les lignes « Remise » du bon texte** (plan des promotions, § 18.6, lot
 * M6) — une par remise quand la feuille en porte PLUSIEURS
 * (`money.discountLines`), chacune nommée par son libellé figé ; sinon LA
 * ligne d'hier, au caractère près. `ttc` = le bon au format du ticket, qui
 * écrit le TTC figé de chaque remise.
 */
export function discountTextLines(
  money: SheetMoney,
  cents: number,
  ttc: boolean,
): readonly string[] {
  const lines = money.discountLines;
  if (lines !== undefined && lines.length > 1) {
    return lines.map((line) =>
      gestureLine(line.label, ttc ? (line.ttcCents ?? line.cents) : line.cents),
    );
  }
  return cents === 0 ? [] : [gestureLine('Remise', cents)];
}

function gestureLine(label: string, cents: number): string {
  const head = `  ${label.padEnd(12, ' ')}  `;
  const value = `−${formatCents(cents)}`;
  return `${head}${value.padStart(Math.max(value.length, GESTURE_LINE_WIDTH - head.length), ' ')}`;
}
