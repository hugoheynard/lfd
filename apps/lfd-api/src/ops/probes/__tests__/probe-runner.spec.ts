import { FAILURES_BEFORE_DOWN, ProbeRunner } from "../probe-runner.service.js";
import { NodeProbe, type ProbeOutcome } from "../probe.port.js";

/** Une sonde de test dont on pilote le verdict d'un appel à l'autre. */
class ScriptedProbe extends NodeProbe {
  readonly id = "shopify";
  private next: ProbeOutcome = { verdict: "up", latencyMs: 1 };

  says(verdict: ProbeOutcome["verdict"]): void {
    this.next = { verdict, latencyMs: 1, detail: "scénario" };
  }

  check(): Promise<ProbeOutcome> {
    return Promise.resolve(this.next);
  }
}

describe("ProbeRunner — la temporisation avant de crier au loup", () => {
  it("ne déclare pas `down` au PREMIER échec", async () => {
    // Un timeout isolé arrive : DNS lent, redéploiement chez le tiers, une
    // seconde de réseau. Crier au loup dessus apprend à ignorer la carte — et
    // personne ne redonne sa confiance à un écran qui l'a perdue.
    const probe = new ScriptedProbe();
    const runner = new ProbeRunner([probe]);
    probe.says("down");

    expect((await runner.run()).get("shopify")?.verdict).toBe("unknown");
  });

  it("confirme après N échecs consécutifs", async () => {
    const probe = new ScriptedProbe();
    const runner = new ProbeRunner([probe]);
    probe.says("down");

    for (let attempt = 1; attempt < FAILURES_BEFORE_DOWN; attempt += 1) {
      await runner.run();
    }

    expect((await runner.run()).get("shopify")?.verdict).toBe("down");
  });

  it("rend `unknown` et non `up` pendant l'attente", async () => {
    // Masquer un premier échec en vert serait mentir dans l'autre sens : on ne
    // sait pas encore, et c'est exactement ce qu'il faut dire.
    const probe = new ScriptedProbe();
    const runner = new ProbeRunner([probe]);
    probe.says("down");
    const first = await runner.run();

    expect(first.get("shopify")?.verdict).not.toBe("up");
    expect(first.get("shopify")?.detail).toContain(`1/${FAILURES_BEFORE_DOWN}`);
  });

  it("remet le compteur à zéro dès qu'une réponse revient", async () => {
    const probe = new ScriptedProbe();
    const runner = new ProbeRunner([probe]);
    probe.says("down");
    await runner.run();
    probe.says("up");
    await runner.run();
    probe.says("down");

    expect((await runner.run()).get("shopify")?.verdict).toBe("unknown");
  });

  it("survit à une sonde qui jette — la carte ne tombe pas avec ce qu'elle observe", async () => {
    class BrokenProbe extends NodeProbe {
      readonly id = "auth0";
      check(): Promise<ProbeOutcome> {
        return Promise.reject(new Error("boum"));
      }
    }
    const runner = new ProbeRunner([new BrokenProbe()]);

    // Premier échec ⇒ pas encore `down`, mais surtout : ça n'a pas jeté.
    await expect(runner.run()).resolves.toBeDefined();
  });
});
