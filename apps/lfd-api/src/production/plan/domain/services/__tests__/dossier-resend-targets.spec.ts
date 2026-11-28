import {
  DossierRecipientUpToDateError,
  DossierResendRecipientUnknownError,
} from "../../errors/dossier-resend-errors.js";
import type { DossierDispatchTrace } from "../../ports/dossier-dispatches.reader.js";
import type { DossierAddressee } from "../dossier-addressees.js";
import { dossierResendsOf, lastReceivedOf } from "../dossier-resend-targets.js";

function addressee(recipientId: string): DossierAddressee {
  return { recipientId, email: `${recipientId}@fournil.fr`, firstName: "", name: recipientId };
}

const EVENING = new Date("2026-11-27T18:00:00.000Z");
const NIGHT = new Date("2026-11-27T21:00:00.000Z");

function trace(
  recipientId: string,
  outcome: DossierDispatchTrace["outcome"],
  planVersion: number | null,
  claimedAt = EVENING,
): DossierDispatchTrace {
  return { recipientId, outcome, planVersion, claimedAt };
}

/** À qui renvoyer le dossier de la version courante (lot H6). */
describe("dossierResendsOf", () => {
  const all = [addressee("a"), addressee("b"), addressee("c"), addressee("d")];
  const last = lastReceivedOf([
    trace("a", "sent", 3),
    trace("b", "sent", 1),
    trace("b", "failed", 3, NIGHT),
    trace("c", "sent", null),
  ]);

  it("« tous les dépassés » : version ancienne, envoi d'avant les versions, rien reçu — pas le destinataire à jour", () => {
    expect(dossierResendsOf({ kind: "outdated" }, all, last, 3)).toEqual([
      { addressee: addressee("b"), sinceVersion: 1, received: true },
      { addressee: addressee("c"), sinceVersion: 1, received: false },
      { addressee: addressee("d"), sinceVersion: 1, received: false },
    ]);
  });

  it("un envoi échoué ne compte pas comme reçu ; un renvoi demandé, si", () => {
    const traces = lastReceivedOf([trace("b", "sent", 1), trace("b", "requested", 3, NIGHT)]);

    expect(dossierResendsOf({ kind: "outdated" }, [addressee("b")], traces, 3)).toEqual([]);
  });

  it("un destinataire visé à jour est refusé ; inconnu, aussi", () => {
    expect(() => dossierResendsOf({ kind: "recipient", recipientId: "a" }, all, last, 3)).toThrow(
      DossierRecipientUpToDateError,
    );
    expect(() => dossierResendsOf({ kind: "recipient", recipientId: "z" }, all, last, 3)).toThrow(
      DossierResendRecipientUnknownError,
    );
  });

  it("un destinataire visé dépassé part de sa version", () => {
    expect(dossierResendsOf({ kind: "recipient", recipientId: "b" }, all, last, 3)).toEqual([
      { addressee: addressee("b"), sinceVersion: 1, received: true },
    ]);
  });
});
