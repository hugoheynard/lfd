import {
  VITRINE_NOTICE_MESSAGE_MAX_LENGTH,
  VITRINE_NOTICE_SUBJECT_MAX_LENGTH,
} from "@lfd/contracts";

import { VitrineSubscriberNotFoundError } from "../errors/vitrine-errors.js";
import {
  VitrineNoticeAttemptRecordedError,
  VitrineNoticeMessageInvalidError,
  VitrineNoticeNoRecipientError,
  VitrineNoticeNothingToResumeError,
  VitrineNoticeRecipientWithoutContactError,
  VitrineNoticeSubjectInvalidError,
} from "../errors/vitrine-notice-errors.js";
import { VitrineNotice } from "../vitrine-notice.js";
import {
  selectVitrineNoticeAddressees,
  type VitrineNoticeCandidate,
} from "../vitrine-notice-audience.js";
import {
  VITRINE_NOTICE_MESSAGE_MAX,
  VITRINE_NOTICE_SUBJECT_MAX,
  VitrineNoticeText,
} from "../vitrine-notice-text.js";
import { AT, LATER } from "./vitrine-fixtures.js";

const AGENCY: VitrineNoticeCandidate = {
  subscriberId: "s1",
  name: "Agence",
  contactEmail: "web@agence.fr",
};
const MUTE: VitrineNoticeCandidate = { subscriberId: "s2", name: "Muette", contactEmail: null };
const OTHER: VitrineNoticeCandidate = {
  subscriberId: "s3",
  name: "Autre",
  contactEmail: "autre@agence.fr",
};

function notice(): VitrineNotice {
  return VitrineNotice.compose({
    id: "n1",
    authorStaffId: "staff-1",
    text: VitrineNoticeText.of("Objet", "Message"),
    idempotencyKey: "k",
    addressees: selectVitrineNoticeAddressees([AGENCY, OTHER], null),
    at: AT,
  });
}

describe("VitrineNoticeText", () => {
  it("rogne l'objet et le message", () => {
    const text = VitrineNoticeText.of("  Objet ", "\n Bonjour \n");
    expect([text.subject, text.message]).toEqual(["Objet", "Bonjour"]);
  });

  it.each(["", "   ", "a\nb", "x".repeat(VITRINE_NOTICE_SUBJECT_MAX + 1)])(
    "refuse l'objet %j",
    (subject) => {
      expect(() => VitrineNoticeText.of(subject, "m")).toThrow(VitrineNoticeSubjectInvalidError);
    },
  );

  it.each(["", "  ", "x".repeat(VITRINE_NOTICE_MESSAGE_MAX + 1)])("refuse le message %#", (m) => {
    expect(() => VitrineNoticeText.of("o", m)).toThrow(VitrineNoticeMessageInvalidError);
  });

  it("garde les bornes que l'écran annonce", () => {
    expect(VITRINE_NOTICE_SUBJECT_MAX).toBe(VITRINE_NOTICE_SUBJECT_MAX_LENGTH);
    expect(VITRINE_NOTICE_MESSAGE_MAX).toBe(VITRINE_NOTICE_MESSAGE_MAX_LENGTH);
  });
});

describe("selectVitrineNoticeAddressees", () => {
  it("sans sélection, retient tous ceux qui ont un contact", () => {
    const chosen = selectVitrineNoticeAddressees([AGENCY, MUTE, OTHER], null);
    expect(chosen.map((a) => a.subscriberId)).toEqual(["s1", "s3"]);
  });

  it("retient la sélection, un e-mail par abonné même choisi deux fois", () => {
    const chosen = selectVitrineNoticeAddressees([AGENCY, OTHER], ["s3", "s3"]);
    expect(chosen).toEqual([
      { subscriberId: "s3", name: "Autre", contactEmail: "autre@agence.fr" },
    ]);
  });

  it("refuse un abonné sans contact, en le nommant sans adresse", () => {
    expect(() => selectVitrineNoticeAddressees([AGENCY, MUTE], ["s2"])).toThrow(
      VitrineNoticeRecipientWithoutContactError,
    );
    expect(() => selectVitrineNoticeAddressees([AGENCY, MUTE], ["s2"])).toThrow(/Muette/u);
  });

  it("refuse un abonné inconnu", () => {
    expect(() => selectVitrineNoticeAddressees([AGENCY], ["zz"])).toThrow(
      VitrineSubscriberNotFoundError,
    );
  });

  it("refuse quand personne n'a de contact, et une sélection vide", () => {
    expect(() => selectVitrineNoticeAddressees([MUTE], null)).toThrow(
      VitrineNoticeNoRecipientError,
    );
    expect(() => selectVitrineNoticeAddressees([AGENCY], [])).toThrow(
      VitrineNoticeNoRecipientError,
    );
  });
});

describe("VitrineNotice", () => {
  it("naît avec des destinataires pas encore tentés", () => {
    expect(notice().unattempted.map((r) => r.subscriberId)).toEqual(["s1", "s3"]);
  });

  it("refuse de naître sans destinataire", () => {
    expect(() =>
      VitrineNotice.compose({
        id: "n",
        authorStaffId: "a",
        text: VitrineNoticeText.of("o", "m"),
        idempotencyKey: "k",
        addressees: [],
        at: AT,
      }),
    ).toThrow(VitrineNoticeNoRecipientError);
  });

  it("consigne l'issue d'un envoi, une seule fois", () => {
    const n = notice();
    n.recordAttempt("s1", true, LATER);
    expect(n.toPersistence().recipients[0]).toMatchObject({ mailSent: true, attemptedAt: LATER });
    expect(n.unattempted.map((r) => r.subscriberId)).toEqual(["s3"]);
    expect(() => n.recordAttempt("s1", false, LATER)).toThrow(VitrineNoticeAttemptRecordedError);
  });

  it("une reprise ne rend que les pas tentés — ni l'accepté, ni le refusé", () => {
    const n = notice();
    n.recordAttempt("s1", true, LATER);
    expect(n.resumption().map((r) => r.subscriberId)).toEqual(["s3"]);
    n.recordAttempt("s3", false, LATER);
    expect(() => n.resumption()).toThrow(VitrineNoticeNothingToResumeError);
  });

  it("refuse de consigner pour qui n'est pas destinataire", () => {
    expect(() => notice().recordAttempt("s2", true, LATER)).toThrow(VitrineSubscriberNotFoundError);
  });

  it("se réhydrate à l'identique, et revalide son texte", () => {
    const row = notice().toPersistence();
    expect(VitrineNotice.rehydrate(row).toPersistence()).toEqual(row);
    expect(() => VitrineNotice.rehydrate({ ...row, subject: "" })).toThrow(
      VitrineNoticeSubjectInvalidError,
    );
  });
});
