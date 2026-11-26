import { IntentRelabel, MAX_RELABEL_ATTEMPTS, relabelDelayMs } from "../intent-relabel.js";
import { IntentLabel } from "../../value-objects/intent-label.js";

const T0 = new Date(Date.UTC(2030, 0, 10, 9));
const LATER = new Date(T0.getTime() + 60_000);

const PLACED = IntentLabel.of({
  description: "LFD · La Folie Coffee pro · Commande n° 2030-00001 · paiement",
  metadata: { order_number: "2030-00001", subject_id: "ord_1" },
});

function fresh(): IntentRelabel {
  return IntentRelabel.request("pay_1", PLACED, T0);
}

describe("IntentRelabel — le libellé définitif d'une intention", () => {
  it("naît dû tout de suite, en première révision", () => {
    const relabel = fresh();

    expect(relabel.isDueAt(T0)).toBe(true);
    expect(relabel.toSnapshot()).toMatchObject({ state: "pending", revision: 1, attempts: 0 });
  });

  it("un libellé identique ne relance rien, même déjà posé (le fait relivré)", () => {
    const relabel = fresh();
    relabel.markPosted(1, T0);

    expect(relabel.describe(PLACED, LATER)).toBe(false);
    expect(relabel.toSnapshot()).toMatchObject({ state: "posted", revision: 1 });
  });

  it("un libellé différent monte la révision et redevient dû", () => {
    const relabel = fresh();
    relabel.markPosted(1, T0);
    const other = IntentLabel.of({ description: "LFD · autre", metadata: { order_number: "2" } });

    expect(relabel.describe(other, LATER)).toBe(true);
    expect(relabel.toSnapshot()).toMatchObject({ state: "pending", revision: 2, attempts: 0 });
  });

  it("l'issue d'un essai sur une révision périmée ne conclut rien", () => {
    const relabel = fresh();
    relabel.describe(IntentLabel.of({ description: "LFD · v2", metadata: {} }), T0);

    expect(relabel.markPosted(1, LATER)).toBe(false);
    expect(relabel.markFailed(1, "x", false, LATER)).toBe("stale");
    expect(relabel.toSnapshot().state).toBe("pending");
  });

  it("une panne se reprend après un délai croissant", () => {
    const relabel = fresh();

    expect(relabel.markFailed(1, "réseau", false, T0)).toBe("retry");
    expect(relabel.isDueAt(T0)).toBe(false);
    expect(relabel.isDueAt(new Date(T0.getTime() + relabelDelayMs(1)))).toBe(true);
    expect(relabelDelayMs(2)).toBeGreaterThan(relabelDelayMs(1));
  });

  it("un refus du prestataire abandonne aussitôt", () => {
    const relabel = fresh();

    expect(relabel.markFailed(1, "No such payment_intent", true, T0)).toBe("abandoned");
    expect(relabel.isDueAt(LATER)).toBe(false);
  });

  it("les essais sont bornés : le dernier abandonne", () => {
    const relabel = fresh();
    for (let attempt = 1; attempt < MAX_RELABEL_ATTEMPTS; attempt += 1) {
      expect(relabel.markFailed(1, "réseau", false, T0)).toBe("retry");
    }

    expect(relabel.markFailed(1, "réseau", false, T0)).toBe("abandoned");
    expect(relabel.toSnapshot().attempts).toBe(MAX_RELABEL_ATTEMPTS);
  });
});
