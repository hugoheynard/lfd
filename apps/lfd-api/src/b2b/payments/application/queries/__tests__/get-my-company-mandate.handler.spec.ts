import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import { CustomerMandateClosedError } from "../../../domain/errors/mandate-errors.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  activeMandate,
  FixedGate,
  FixedGuard,
  InMemoryMandates,
  mandate,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { GetMyCompanyMandateHandler } from "../get-my-company-mandate.handler.js";
import { GetMyCompanyMandateQuery } from "../get-my-company-mandate.query.js";

function harness(role: BankAccountRole | null = "owner", open = true) {
  const steps = new Steps();
  const mandates = new InMemoryMandates(steps);
  const handler = new GetMyCompanyMandateHandler(
    new FixedGuard(steps, role),
    new FixedGate(steps, open),
    mandates,
  );
  return {
    steps,
    mandates,
    run: () => handler.execute(new GetMyCompanyMandateQuery("usr_1", "cmp_1")),
  };
}

describe("GetMyCompanyMandateHandler — la carte mandat du client", () => {
  it("rend null quand la société n'a jamais eu de mandat", async () => {
    await expect(harness().run()).resolves.toBeNull();
  });

  /** Le contrat de fin de §9 : six champs, et aucun qui dise le compte. */
  it("rend le contrat client exact, sans compte ni date de révocation", async () => {
    const h = harness("billing");
    h.mandates.current = activeMandate({ last4: "2606", bankCode: "CEPA", country: "FR" });

    await expect(h.run()).resolves.toEqual({
      id: "mdt_actif",
      reference: "LFC-9P2X4B-260914-K7M3QT",
      status: "active",
      hasProof: true,
      proofFileName: "mandat-actif.pdf",
      acceptedAt: "2026-01-15T00:00:00.000Z",
    });
  });

  it("rend le brouillon quand aucun actif n'existe", async () => {
    const h = harness();
    h.mandates.draft = mandate();

    expect((await h.run())?.status).toBe("draft");
  });

  it.each<BankAccountRole>(["admin", "orders"])("refuse %s en 403", async (role) => {
    await expect(harness(role).run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
  });

  it("refuse un non-membre en 404", async () => {
    await expect(harness(null).run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
  });

  it("refuse en 409 quand le drapeau est fermé, sans lire les mandats", async () => {
    const h = harness("owner", false);

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.steps.log).toEqual(["guard", "gate"]);
  });
});
