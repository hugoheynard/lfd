import { CustomerCancellationPolicyGate } from "../customer-cancellation-policy.js";
import {
  customerSubject,
  FixedCancellationSettings,
} from "../../commands/__tests__/customer-cancellation-doubles.js";

/**
 * **L'instant figé fait foi** (Hugo, 2026-10-26) : une commande passée sous un
 * délai le garde, quel que soit le réglage le jour où le client annule. Tout
 * est relatif à `NOW`, l'instant que la porte reçoit — elle ne lit aucune
 * horloge.
 */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));
const HOUR_MS = 3_600_000;
// Jour de service : le 15 à minuit, heure de Paris (pas de créneau) = le 14, 23:00 UTC.
const SERVICE_DAY = "2030-01-15";
const ANCHOR = new Date(Date.UTC(2030, 0, 14, 23));
const FROZEN_24 = new Date(ANCHOR.getTime() - 24 * HOUR_MS);

function gateWith(delayEnabled: boolean, hoursBefore: number): CustomerCancellationPolicyGate {
  return new CustomerCancellationPolicyGate(
    new FixedCancellationSettings({ delayEnabled, hoursBefore }),
  );
}

describe("CustomerCancellationPolicyGate — le délai figé à la passation", () => {
  it("le réglage se raccourcit à 1 h après la commande : l'instant figé à 24 h refuse quand même", async () => {
    // Figé à 24 h ; le réglage passe à 1 h. 2 h avant l'ancre : trop tard.
    const now = new Date(ANCHOR.getTime() - 2 * HOUR_MS);
    const applied = await gateWith(true, 1).windowOf(
      customerSubject({ serviceDay: SERVICE_DAY, customerCancellableUntil: FROZEN_24 }),
      now,
    );
    expect(applied).toEqual({
      window: { kind: "too_late", until: FROZEN_24 },
      hoursBefore: 24,
    });
  });

  it("le réglage s'allonge à 168 h après la commande : l'instant figé laisse annuler", async () => {
    // Figé à 24 h ; le réglage passe à une semaine. 48 h avant l'ancre : ouverte.
    const now = new Date(ANCHOR.getTime() - 48 * HOUR_MS);
    const applied = await gateWith(true, 168).windowOf(
      customerSubject({ serviceDay: SERVICE_DAY, customerCancellableUntil: FROZEN_24 }),
      now,
    );
    expect(applied?.window).toEqual({ kind: "open", until: FROZEN_24 });
  });

  it("le délai désactivé depuis la commande ne retire pas le délai figé", async () => {
    const now = new Date(ANCHOR.getTime() - 2 * HOUR_MS);
    const applied = await gateWith(false, 24).windowOf(
      customerSubject({ serviceDay: SERVICE_DAY, customerCancellableUntil: FROZEN_24 }),
      now,
    );
    expect(applied?.window.kind).toBe("too_late");
  });

  it("une commande d'avant la colonne (nul) garde le calcul au réglage du jour", async () => {
    const applied = await gateWith(true, 1).windowOf(
      customerSubject({ serviceDay: SERVICE_DAY, customerCancellableUntil: null }),
      NOW,
    );
    expect(applied).toEqual({
      window: { kind: "open", until: new Date(ANCHOR.getTime() - HOUR_MS) },
      hoursBefore: 1,
    });
  });

  it("nul et réglage sans délai : aucun délai, seul l'arrêt du plan limite", async () => {
    const applied = await gateWith(false, 24).windowOf(
      customerSubject({ serviceDay: SERVICE_DAY, customerCancellableUntil: null }),
      NOW,
    );
    expect(applied).toBeNull();
  });

  it("une commande de société n'a jamais de délai, même figé par erreur", async () => {
    const applied = await gateWith(true, 24).windowOf(
      customerSubject({
        companyId: "co_1",
        serviceDay: SERVICE_DAY,
        customerCancellableUntil: FROZEN_24,
      }),
      NOW,
    );
    expect(applied).toBeNull();
  });
});
