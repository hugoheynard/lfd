import {
  mailSendDeliveryOf,
  mailSendStateOf,
  NO_PROBLEM,
  problemRankOf,
  storedStatusOf,
} from "../mail-send-state.js";

describe("les états servis par le suivi (décisions 1, 10, 12)", () => {
  it("`sent` est servi `accepted`, les autres tels quels", () => {
    expect(mailSendStateOf("sent")).toBe("accepted");
    expect(mailSendStateOf("requested")).toBe("requested");
    expect(mailSendStateOf("sending")).toBe("sending");
    expect(mailSendStateOf("failed")).toBe("failed");
    expect(mailSendStateOf("refused")).toBe("refused");
  });

  it("le filtre `accepted` vise `sent` en base", () => {
    expect(storedStatusOf("accepted")).toBe("sent");
    expect(storedStatusOf("failed")).toBe("failed");
  });

  it("une acceptation sans identifiant Resend est `dry_run`, jamais « rien reçu »", () => {
    expect(mailSendDeliveryOf("sent", null, null)).toBe("dry_run");
  });

  it("une acceptation réelle sans retour est `null`, avec retour le retour", () => {
    expect(mailSendDeliveryOf("sent", "re_1", null)).toBeNull();
    expect(mailSendDeliveryOf("sent", "re_1", "bounced")).toBe("bounced");
  });

  it("une demande pas encore partie n'est pas à blanc", () => {
    expect(mailSendDeliveryOf("requested", null, null)).toBeNull();
    expect(mailSendDeliveryOf("failed", null, null)).toBeNull();
  });

  it("les problèmes d'abord : échec ou refus, puis rebond ou spam, puis retard", () => {
    expect(problemRankOf("failed", null)).toBe(0);
    expect(problemRankOf("refused", null)).toBe(0);
    expect(problemRankOf("sent", "bounced")).toBe(1);
    expect(problemRankOf("sent", "complained")).toBe(1);
    expect(problemRankOf("sent", "delayed")).toBe(2);
    expect(problemRankOf("sent", "delivered")).toBe(NO_PROBLEM);
    expect(problemRankOf("sent", null)).toBe(NO_PROBLEM);
    expect(problemRankOf("requested", null)).toBe(NO_PROBLEM);
  });
});
