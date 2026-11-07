import {
  MailSenderChangedError,
  MailSenderRefusedError,
  SenderDomainNotVerifiedError,
  StoredMailSenderUnreadableError,
} from "../mail-sender-errors.js";
import { MailSpaceSender } from "../mail-space-sender.js";

const IDENTITY = {
  senderName: "  La Folie Douce ",
  fromAddress: "no-reply@lfd-backoffice.com",
  replyToAddress: null,
};
const VERIFIED = ["lafoliecoffee.info", "lfd-backoffice.com"];
const STAMP = { at: new Date(0), staffId: "fiche-colette" };

describe("MailSpaceSender", () => {
  it("un espace jamais réglé n'a pas d'identité, révision 0", () => {
    expect(MailSpaceSender.unset("lfd").snapshot()).toEqual({
      space: "lfd",
      revision: 0,
      identity: null,
      changed: null,
    });
  });

  it("change l'identité sur un domaine vérifié, nom rogné, révision montée", () => {
    const sender = MailSpaceSender.unset("lfd");
    sender.change(IDENTITY, VERIFIED, 0, STAMP);
    expect(sender.snapshot()).toEqual({
      space: "lfd",
      revision: 1,
      identity: { ...IDENTITY, senderName: "La Folie Douce" },
      changed: STAMP,
    });
    expect(sender.loadedRevision).toBe(0);
  });

  it("compare le domaine sans tenir compte de la casse", () => {
    const sender = MailSpaceSender.unset("lfd");
    sender.change({ ...IDENTITY, fromAddress: "No-Reply@LFD-Backoffice.com" }, VERIFIED, 0, STAMP);
    expect(sender.snapshot().revision).toBe(1);
  });

  it("refuse nommément un domaine qui n'est pas vérifié chez Resend", () => {
    const sender = MailSpaceSender.unset("lfd");
    const change = (): void => sender.change(IDENTITY, ["lafoliecoffee.info"], 0, STAMP);
    expect(change).toThrow(SenderDomainNotVerifiedError);
    expect(change).toThrow(/lfd-backoffice\.com n'est pas vérifié chez Resend/);
    expect(sender.snapshot().identity).toBeNull();
  });

  it("refuse un sous-domaine d'un domaine vérifié : Resend vérifie chaque domaine", () => {
    const sender = MailSpaceSender.unset("lfd");
    expect(() =>
      sender.change({ ...IDENTITY, fromAddress: "a@mail.lafoliecoffee.info" }, VERIFIED, 0, STAMP),
    ).toThrow(SenderDomainNotVerifiedError);
  });

  it("refuse une identité mal formée avant de regarder le domaine", () => {
    const sender = MailSpaceSender.unset("lfd");
    expect(() => sender.change({ ...IDENTITY, senderName: "" }, VERIFIED, 0, STAMP)).toThrow(
      MailSenderRefusedError,
    );
  });

  it("refuse une révision dépassée", () => {
    const sender = MailSpaceSender.unset("lfd");
    expect(() => sender.change(IDENTITY, VERIFIED, 3, STAMP)).toThrow(MailSenderChangedError);
  });

  it("refuse de relire une identité rangée qui n'en a plus la forme", () => {
    expect(() =>
      MailSpaceSender.reconstitute({
        space: "lfc",
        revision: 2,
        identity: { ...IDENTITY, fromAddress: "pas-une-adresse" },
        changed: STAMP,
      }),
    ).toThrow(StoredMailSenderUnreadableError);
  });
});
