import { SystemRequestReasonLockedError } from "../errors/email-reply-errors.js";
import { RequestReason } from "../request-reason.js";
import { AT, CONTACT_SETTINGS, LATER } from "./request-fixtures.js";

/** Le motif système « Réponse à un e-mail », tel que la migration le pose. */
function systemReason(): RequestReason {
  return RequestReason.rehydrate({
    id: "system_email_reply",
    kind: "email_reply",
    label: { fr: "Réponse à un e-mail", en: "", it: "" },
    recipientEmail: "reponses@reponses.lafoliecoffee.info",
    position: 0,
    active: true,
    audience: "both",
    priority: "medium",
    archivedAt: null,
    createdAt: AT,
    updatedAt: AT,
  });
}

describe("le motif système des réponses par e-mail", () => {
  it("se relit depuis la base", () => {
    expect(systemReason().kind).toBe("email_reply");
  });

  it("ne se crée pas à l'écran", () => {
    expect(() =>
      RequestReason.create({ ...CONTACT_SETTINGS, kind: "email_reply", id: "r2", at: AT }),
    ).toThrow(SystemRequestReasonLockedError);
  });

  it("ne se révise ni ne s'archive", () => {
    const reason = systemReason();
    expect(() => reason.revise({ ...CONTACT_SETTINGS, kind: "email_reply" }, LATER)).toThrow(
      SystemRequestReasonLockedError,
    );
    expect(() => reason.archive(LATER)).toThrow(SystemRequestReasonLockedError);
  });
});
