import { AddMarketNafCommand } from "../../src/growth/application/commands/add-market-naf.command.js";
import { AddMarketZoneCommand } from "../../src/growth/application/commands/add-market-zone.command.js";
import { RefreshMarketCommand } from "../../src/growth/application/commands/refresh-market.command.js";
import { MarketConfigStore } from "../../src/growth/domain/ports/market-config.store.js";
import { SEED_STAFF, type SeedHarness } from "./harness.js";

/** Les codes postaux distincts du corpus Savoie (dénominateur de la pénétration). */
const ZONES: readonly string[] = ["73150", "73320", "73700"];

/** Les NAF ciblés, alignés sur les secteurs des personas. */
const NAF_CODES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "56.10A", label: "Restauration traditionnelle" },
  { code: "56.30Z", label: "Débits de boissons" },
  { code: "55.10Z", label: "Hôtels et hébergement similaire" },
  { code: "56.29A", label: "Restauration collective sous contrat" },
  { code: "56.21Z", label: "Services des traiteurs" },
  { code: "56.10C", label: "Restauration de type rapide" },
];

/**
 * Phase **marché ciblé** : pose la config Savoie (zones + NAF) puis **fige le
 * dénominateur** `addressable` via le VRAI refresh (API entreprises réelle — le seul
 * appel réseau du seed). Idempotent : upserts, et le refresh n'est relancé que si une
 * zone n'a pas encore été comptée (évite de re-taper l'API à chaque reseed).
 * Best-effort : API injoignable ⇒ la config est posée, `addressable` reste à 0
 * (rattrapable par « Redemander » dans Réglages). Rend `true` si un refresh a eu lieu.
 */
export async function seedMarket(harness: SeedHarness, anchor: Date): Promise<boolean> {
  for (const codePostal of ZONES) {
    await harness.commands.execute<AddMarketZoneCommand, void>(new AddMarketZoneCommand(codePostal));
  }
  for (const naf of NAF_CODES) {
    await harness.commands.execute<AddMarketNafCommand, void>(
      new AddMarketNafCommand(naf.code, naf.label),
    );
  }
  const store = harness.module.get(MarketConfigStore, { strict: false });
  const config = await store.load();
  if (!config.zones.some((zone) => zone.fetchedAt === null)) {
    return false; // Toutes les zones déjà comptées : rien à redemander.
  }
  try {
    await harness.runAt(anchor, SEED_STAFF, () =>
      harness.commands.execute<RefreshMarketCommand, void>(new RefreshMarketCommand()),
    );
    return true;
  } catch {
    return false;
  }
}
