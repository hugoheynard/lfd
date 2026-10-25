import type { AttestedHandover } from "../../ports/handover-attestations.reader.js";
import { queueStateOf, showsInQueue } from "../queue-state.js";

const ATTESTED: AttestedHandover = {
  handedOverAt: new Date(1_000),
  handedOverBy: "stf_paul",
  via: "scan",
};

describe("queueStateOf", () => {
  // Le sac est parti : une annulation postérieure ne doit pas repeindre la ligne.
  it("`handed_over` gagne sur une annulation", () => {
    expect(queueStateOf({ status: "cancelled", readyAt: null }, ATTESTED)).toBe("handed_over");
    expect(queueStateOf({ status: "placed", readyAt: new Date(1) }, ATTESTED)).toBe("handed_over");
  });

  it("`cancelled` gagne sur `ready`", () => {
    expect(queueStateOf({ status: "cancelled", readyAt: new Date(1) }, undefined)).toBe(
      "cancelled",
    );
  });

  it("`ready` si le fournil a déclaré prête, `expected` sinon (jamais colisée = remettable)", () => {
    expect(queueStateOf({ status: "placed", readyAt: new Date(0) }, undefined)).toBe("ready");
    expect(queueStateOf({ status: "placed", readyAt: null }, undefined)).toBe("expected");
  });
});

describe("showsInQueue", () => {
  it("cache une commande ni réglée, ni retirée, ni annulée", () => {
    expect(showsInQueue({ status: "placed", settled: false }, undefined)).toBe(false);
  });

  it("montre une commande réglée", () => {
    expect(showsInQueue({ status: "placed", settled: true }, undefined)).toBe(true);
  });

  it("montre une commande retirée puis remboursée (non réglée)", () => {
    expect(showsInQueue({ status: "placed", settled: false }, ATTESTED)).toBe(true);
  });

  it("montre une commande annulée, réglée ou non", () => {
    expect(showsInQueue({ status: "cancelled", settled: false }, undefined)).toBe(true);
    expect(showsInQueue({ status: "cancelled", settled: true }, undefined)).toBe(true);
  });
});
