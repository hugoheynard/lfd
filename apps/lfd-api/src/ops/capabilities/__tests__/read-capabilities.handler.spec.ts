import type { MissingCapability } from "../../../platform/startup/capability-audit.js";
import { CapabilityInventory } from "../capability-inventory.port.js";
import { ReadCapabilitiesHandler } from "../read-capabilities.handler.js";

/** L'inventaire doublé : une révision et une liste fixes. */
class FixedInventory extends CapabilityInventory {
  constructor(private readonly entries: readonly MissingCapability[]) {
    super();
  }

  revision(): string {
    return "abc1234";
  }

  missing(): readonly MissingCapability[] {
    return this.entries;
  }
}

const DEGRADED: MissingCapability = {
  capability: "Retour du courrier",
  setting: "RESEND_WEBHOOK_SECRET",
  consequence: "on n'apprend jamais lesquels ont rebondi",
  severity: "degraded",
};

const BLOCKING: MissingCapability = {
  capability: "Porte de secours (admin racine)",
  setting: "BOOTSTRAP_ADMIN_EMAIL",
  consequence: "« Aucun accès » à la connexion",
  severity: "blocking",
};

describe("ReadCapabilitiesHandler", () => {
  it("rend la révision servie et une liste vide quand tout est branché", async () => {
    const report = await new ReadCapabilitiesHandler(new FixedInventory([])).execute();

    expect(report).toEqual({ revision: "abc1234", missing: [] });
  });

  it("remonte une bloquante constatée au démarrage au-dessus d'une dégradée", async () => {
    const report = await new ReadCapabilitiesHandler(
      new FixedInventory([DEGRADED, BLOCKING]),
    ).execute();

    expect(report.missing.map((entry) => entry.severity)).toEqual(["blocking", "degraded"]);
    expect(report.missing[0]).toEqual(BLOCKING);
  });

  it("ne transmet que les quatre champs décidés", async () => {
    const widened = { ...DEGRADED, value: "re_secret" };
    const report = await new ReadCapabilitiesHandler(new FixedInventory([widened])).execute();

    expect(Object.keys(report.missing[0] ?? {}).sort()).toEqual([
      "capability",
      "consequence",
      "setting",
      "severity",
    ]);
  });
});
