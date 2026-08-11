import { ALERT_KINDS, type AccountAlertOverride } from "@lfd/contracts";

import type { StoredAlertRule } from "../../../domain/alert-rules.js";
import { SaveAccountAlertOverrideCommand } from "../save-account-alert-override.command.js";
import { SaveAccountAlertOverrideHandler } from "../save-account-alert-override.handler.js";

const DRIFT = "product.quantity_drift";
const GLOBAL = ALERT_KINDS[DRIFT].defaults;

/** Ports doublés : on observe ce qui est écrit, et ce qui est effacé. */
function build(stored: readonly StoredAlertRule[] = []) {
  const saved: AccountAlertOverride[] = [];
  const cleared: string[] = [];
  const handler = new SaveAccountAlertOverrideHandler(
    {
      readForCompany: () => Promise.resolve([]),
      save: (_companyId, override) => {
        saved.push(override);
        return Promise.resolve();
      },
      clear: (_companyId, kind) => {
        cleared.push(kind);
        return Promise.resolve();
      },
    },
    { readAll: () => Promise.resolve([...stored]), save: () => Promise.resolve() },
  );
  return { handler, saved, cleared };
}

describe("SaveAccountAlertOverrideHandler", () => {
  it("écrit une dérogation qui dévie réellement du global", async () => {
    const { handler, saved, cleared } = build();
    const own: AccountAlertOverride = {
      kind: DRIFT,
      mode: "custom",
      rule: { ...GLOBAL, params: { ...GLOBAL.params, direction: "up" } as typeof GLOBAL.params },
    };

    await handler.execute(new SaveAccountAlertOverrideCommand("c1", own, "staff|hugo"));

    expect(saved).toHaveLength(1);
    expect(cleared).toHaveLength(0);
  });

  /**
   * Régression : un aller-retour dans l'éditeur (changer une valeur, la remettre,
   * enregistrer) détachait le compte à VIE — affiché « réglée pour ce compte »,
   * contenu identique au global, et plus jamais aligné sur ses évolutions.
   */
  it("EFFACE au lieu d'écrire une dérogation identique au global", async () => {
    const { handler, saved, cleared } = build();
    const identical: AccountAlertOverride = { kind: DRIFT, mode: "custom", rule: { ...GLOBAL } };

    await handler.execute(new SaveAccountAlertOverrideCommand("c1", identical, "staff|hugo"));

    expect(saved).toHaveLength(0);
    expect(cleared).toEqual([DRIFT]);
  });

  it("ne confond pas « identique au global » avec « identique aux défauts »", async () => {
    // Le global a été réglé : c'est LUI la référence, pas la valeur d'usine.
    const tweaked: StoredAlertRule = {
      kind: DRIFT,
      readable: true,
      enabled: false,
      params: GLOBAL.params,
      delivery: GLOBAL.delivery,
      updatedAt: new Date("2026-08-11T09:00:00.000Z"),
      updatedBy: "staff|hugo",
    };
    const { handler, saved, cleared } = build([tweaked]);
    const asDefaults: AccountAlertOverride = { kind: DRIFT, mode: "custom", rule: { ...GLOBAL } };

    await handler.execute(new SaveAccountAlertOverrideCommand("c1", asDefaults, "staff|hugo"));

    // `enabled` diffère du global réglé : c'est une vraie dérogation.
    expect(saved).toHaveLength(1);
    expect(cleared).toHaveLength(0);
  });

  it("n'efface jamais un `off` — se retirer n'est pas suivre", async () => {
    const { handler, saved, cleared } = build();
    const off: AccountAlertOverride = { kind: DRIFT, mode: "off" };

    await handler.execute(new SaveAccountAlertOverrideCommand("c1", off, "staff|hugo"));

    expect(saved).toEqual([off]);
    expect(cleared).toHaveLength(0);
  });
});
