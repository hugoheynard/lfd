import type { PortfolioPulse } from "@lfd/contracts";

/**
 * La **bande de stabilité** : en dessous, on ne bouge pas, on respire.
 *
 * Sans elle, un compte à +3 % serait rangé « en croissance » et la colonne du
 * milieu resterait vide — le tableau dirait alors que tout bouge tout le temps,
 * ce qui revient à ne rien dire. 10 % est un point de départ à ajuster une fois
 * qu'on aura vu ce que les chiffres racontent vraiment.
 */
const FLAT_BAND = 0.1;

/** Ce qu'un compte a pesé sur chacune des deux fenêtres, en centimes. */
export interface AccountRevenueWindows {
  readonly previousCents: number;
  readonly currentCents: number;
}

/**
 * Range chaque compte selon **sa propre** variation (pur).
 *
 * Un compte qui n'a rien pesé sur aucune des deux fenêtres est **écarté** : il
 * n'est pas stable, il est absent. Le compter comme stable remplirait la colonne
 * du milieu de tous les dormants du fichier, et le chiffre ne voudrait plus rien
 * dire.
 *
 * Partir de zéro compte comme une croissance, et tomber à zéro comme une baisse
 * — ce sont les deux mouvements qu'un commercial veut voir en premier.
 */
export function classifyPulse(accounts: readonly AccountRevenueWindows[]): PortfolioPulse {
  let growing = 0;
  let flat = 0;
  let shrinking = 0;

  for (const account of accounts) {
    const { previousCents, currentCents } = account;
    if (previousCents === 0 && currentCents === 0) {
      continue;
    }
    if (previousCents === 0) {
      growing += 1;
      continue;
    }
    const variation = (currentCents - previousCents) / previousCents;
    if (variation > FLAT_BAND) {
      growing += 1;
    } else if (variation < -FLAT_BAND) {
      shrinking += 1;
    } else {
      flat += 1;
    }
  }

  return { growing, flat, shrinking };
}
