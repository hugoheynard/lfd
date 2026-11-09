import {
  MailSenderChangedError,
  MailSenderNatureNotOfferedError,
  MailSenderRefusedError,
  SenderDomainNotVerifiedError,
  StoredMailSenderUnreadableError,
} from "../mail-sender-errors.js";
import { MailSpaceSender } from "../mail-space-sender.js";

const IDENTITY = {
  senderName: "  La Folie Douce ",
  fromAddress: "no-reply@lfd-backoffice.com",
  replyToAddress: "support@lfd-backoffice.com",
};
const VERIFIED = ["lafoliecoffee.info", "lfd-backoffice.com"];
const STAMP = { at: new Date(0), staffId: "fiche-colette" };

describe("MailSpaceSender", () => {
  it("un espace jamais réglé n'a pas d'identité, révision 0", () => {
    expect(MailSpaceSender.unset("lfd", "transactional").snapshot()).toEqual({
      space: "lfd",
      nature: "transactional",
      revision: 0,
      identity: null,
      changed: null,
    });
  });

  it("change l'identité sur un domaine vérifié, nom rogné, révision montée", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    sender.change(IDENTITY, VERIFIED, 0, STAMP);
    expect(sender.snapshot()).toEqual({
      space: "lfd",
      nature: "transactional",
      revision: 1,
      identity: { ...IDENTITY, senderName: "La Folie Douce" },
      changed: STAMP,
    });
    expect(sender.loadedRevision).toBe(0);
  });

  it("compare le domaine sans tenir compte de la casse", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    sender.change({ ...IDENTITY, fromAddress: "No-Reply@LFD-Backoffice.com" }, VERIFIED, 0, STAMP);
    expect(sender.snapshot().revision).toBe(1);
  });

  it("refuse nommément un domaine qui n'est pas vérifié chez Resend", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    const change = (): void => sender.change(IDENTITY, ["lafoliecoffee.info"], 0, STAMP);
    expect(change).toThrow(SenderDomainNotVerifiedError);
    expect(change).toThrow(/lfd-backoffice\.com n'est pas vérifié chez Resend/);
    expect(sender.snapshot().identity).toBeNull();
  });

  it("refuse un sous-domaine d'un domaine vérifié : Resend vérifie chaque domaine", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    expect(() =>
      sender.change({ ...IDENTITY, fromAddress: "a@mail.lafoliecoffee.info" }, VERIFIED, 0, STAMP),
    ).toThrow(SenderDomainNotVerifiedError);
  });

  it("refuse une identité mal formée avant de regarder le domaine", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    expect(() => sender.change({ ...IDENTITY, senderName: "" }, VERIFIED, 0, STAMP)).toThrow(
      MailSenderRefusedError,
    );
  });

  it("refuse une révision dépassée", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    expect(() => sender.change(IDENTITY, VERIFIED, 3, STAMP)).toThrow(MailSenderChangedError);
  });

  it("refuse de relire une identité rangée qui n'en a plus la forme", () => {
    expect(() =>
      MailSpaceSender.reconstitute({
        space: "lfc",
        nature: "transactional",
        revision: 2,
        identity: { ...IDENTITY, fromAddress: "pas-une-adresse" },
        changed: STAMP,
      }),
    ).toThrow(StoredMailSenderUnreadableError);
  });

  /** Décision du 2026-11-07 : les réponses à un `no-reply` étaient perdues. */
  it("refuse un nouvel enregistrement sans adresse de réponse, ou en no-reply", () => {
    const sender = MailSpaceSender.unset("lfd", "transactional");
    expect(() => sender.change({ ...IDENTITY, replyToAddress: null }, VERIFIED, 0, STAMP)).toThrow(
      /Les réponses à vos e-mails seraient perdues/,
    );
    expect(() =>
      sender.change({ ...IDENTITY, replyToAddress: "No_Reply@lfd.fr" }, VERIFIED, 0, STAMP),
    ).toThrow(MailSenderRefusedError);
    expect(sender.snapshot().identity).toBeNull();
  });

  it("relit une identité rangée avant la règle, sans adresse de réponse", () => {
    const sender = MailSpaceSender.reconstitute({
      space: "lfc",
      nature: "transactional",
      revision: 2,
      identity: { ...IDENTITY, replyToAddress: null },
      changed: STAMP,
    });
    expect(sender.snapshot().identity?.replyToAddress).toBeNull();
    expect(() => sender.change({ ...IDENTITY, replyToAddress: null }, VERIFIED, 2, STAMP)).toThrow(
      MailSenderRefusedError,
    );
  });

  it("règle l'identité marketing d'un espace qui envoie du marketing, sous sa nature", () => {
    const sender = MailSpaceSender.unset("lfc", "marketing");
    sender.change(
      { ...IDENTITY, fromAddress: "offres@news.lafoliecoffee.info" },
      ["news.lafoliecoffee.info"],
      0,
      STAMP,
    );
    expect(sender.snapshot()).toMatchObject({ space: "lfc", nature: "marketing", revision: 1 });
  });

  /** Règle 19 : l'espace de l'équipe n'envoie jamais de marketing — l'identité n'existe pas. */
  it("refuse nommément une identité marketing pour l'espace de l'équipe", () => {
    expect(() => MailSpaceSender.unset("lfd", "marketing")).toThrow(
      MailSenderNatureNotOfferedError,
    );
    expect(() =>
      MailSpaceSender.reconstitute({
        space: "lfd",
        nature: "marketing",
        revision: 1,
        identity: IDENTITY,
        changed: STAMP,
      }),
    ).toThrow(/n'envoie que des e-mails transactionnels/);
  });
});
