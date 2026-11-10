import { addDays } from "@lfd/contracts";

import { NOW } from "../../commands/__tests__/account-bank-export-doubles.js";
import { TODAY, stored } from "./collection-procedure-doubles.js";
import { world } from "./collection-procedure-world.js";

/**
 * Les attestations du lot dans la lecture d'état (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, § 3.3, P3) : « remise
 * signée » fait passer l'onglet 3 à « fait », la dernière ligne d'une sorte
 * fait foi, et aucune attestation n'entre dans l'onglet 4.
 */

function deposited(id = "dep") {
  return stored(id, {
    status: "deposited",
    depositedAt: NOW.toISOString(),
    requestedCollectionDay: addDays(TODAY, -2),
  });
}

describe("la procédure — les attestations du lot (P3)", () => {
  it("déposé sans signature attestée : l'onglet 3 attend, l'onglet 4 se suit quand même", async () => {
    const w = world();
    w.batches.batches = [deposited()];

    const view = await w.read();

    expect(view.file).toMatchObject({ state: "waiting", reason: "signature_to_attest" });
    expect(view.returns.state).not.toBe("locked");
    expect(view.followed?.attestations).toEqual({
      audit_reviewed: null,
      remittance_signed: null,
      psr_read: null,
    });
  });

  it("signée : l'onglet 3 est fait, et chaque attestation dit quand et par qui", async () => {
    const w = world();
    w.batches.batches = [deposited()];
    w.attestations.attest("dep", "audit_reviewed");
    w.attestations.attest("dep", "remittance_signed");

    const view = await w.read();

    expect(view.file).toMatchObject({ state: "done", reason: "deposited" });
    expect(view.followed?.attestations).toEqual({
      audit_reviewed: { at: NOW.toISOString(), byName: "Claire Compta" },
      remittance_signed: { at: NOW.toISOString(), byName: "Claire Compta" },
      psr_read: null,
    });
  });

  it("« PSR lus » est facultatif : sans signature, il ne fait pas l'onglet (Q5)", async () => {
    const w = world();
    w.batches.batches = [deposited()];
    w.attestations.attest("dep", "psr_read");

    expect((await w.read()).file.reason).toBe("signature_to_attest");
  });

  it("une signature retirée ne compte plus : la dernière ligne fait foi", async () => {
    const w = world();
    w.batches.batches = [deposited()];
    w.attestations.attest("dep", "remittance_signed");
    w.attestations.attest("dep", "remittance_signed", true);

    const view = await w.read();

    expect(view.file.reason).toBe("signature_to_attest");
    expect(view.followed?.attestations.remittance_signed).toBeNull();
  });

  it("l'attestation d'un autre lot ne signe pas celui-ci", async () => {
    const w = world();
    w.batches.batches = [deposited()];
    w.attestations.attest("autre");

    expect((await w.read()).file.reason).toBe("signature_to_attest");
  });
});
