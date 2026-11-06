import type { MailReceipt } from "@lfd/mailer";

import type { MailDemand } from "../../../channels/requests/mail.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../channels/requests/__tests__/recording-mail.js";
import {
  activeMailCopyOverlay,
  type MailCopyOverlay,
} from "../../../templates/copy/mail-copy-overlay.js";
import type { B2bMails } from "../../../templates/mail-templates.js";
import {
  activeMailLayout,
  type MailLayoutScope,
} from "../../../templates/sections/mail-layout-scope.js";
import { UnknownMailError } from "../../domain/mail-copy-errors.js";
import { SpecimenMailTrialSender } from "../specimen-mail-trial.sender.js";

/**
 * La porte doublée, qui retient aussi le périmètre ouvert AU MOMENT de
 * l'envoi : c'est lui que le mailer lira pour rendre le brouillon.
 */
class ScopeWitnessMails extends RecordingMail {
  overlay: MailCopyOverlay | undefined;
  layout: MailLayoutScope | undefined;

  constructor() {
    super(new OpenableUnitOfWork());
  }

  override sendAndAwaitReceipt<K extends keyof B2bMails>(
    demand: MailDemand<K>,
  ): Promise<MailReceipt> {
    this.overlay = activeMailCopyOverlay();
    this.layout = activeMailLayout();
    return super.sendAndAwaitReceipt(demand);
  }
}

const TEXTS = { "customer.access-opened": { heading: "Bienvenue, brouillon" } };
const FIRST = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const SECOND = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

/*
 * L'essai d'un e-mail, lot S2h (`plan-service-e-mails.md`) : par le bloc
 * `mail`, en `sendAndAwaitReceipt` — le staff lit l'issue —, une clé par intention (revue, cas 4), et le
 * brouillon ouvert en périmètre pendant l'envoi.
 */
describe("SpecimenMailTrialSender", () => {
  it("envoie sur-le-champ par le bloc, une clé par intention d'essai", async () => {
    const mails = new ScopeWitnessMails();
    const sender = new SpecimenMailTrialSender(mails);

    await sender.send("staff@lfc.fr", "customer.access-opened", "fr", TEXTS, null, FIRST);
    await sender.send("staff@lfc.fr", "customer.access-opened", "fr", TEXTS, null, SECOND);

    expect(mails.queued).toEqual([]);
    expect(
      mails.awaitedReceipt.map(({ to, template, brand }) => ({ to, template, brand })),
    ).toEqual([
      { to: "staff@lfc.fr", template: "customer.access-opened", brand: "lfc" },
      { to: "staff@lfc.fr", template: "customer.access-opened", brand: "lfc" },
    ]);
    expect(mails.awaitedReceipt.map((mail) => mail.idempotencyKey)).toEqual([
      `mail-copy.trial:${FIRST}`,
      `mail-copy.trial:${SECOND}`,
    ]);
  });

  it("le brouillon et l'ordre choisi sont ouverts pendant l'envoi, sans repères", async () => {
    const mails = new ScopeWitnessMails();
    const sender = new SpecimenMailTrialSender(mails);

    await sender.send(
      "staff@lfc.fr",
      "customer.access-opened",
      "fr",
      TEXTS,
      ["unknown", "body"],
      FIRST,
    );

    expect(mails.overlay).toEqual({ fr: TEXTS });
    expect(mails.layout?.markers).toBe(false);
  });

  it("un e-mail hors registre est refusé avant tout envoi", async () => {
    const mails = new ScopeWitnessMails();
    const sender = new SpecimenMailTrialSender(mails);

    await expect(sender.send("staff@lfc.fr", "nope", "fr", {}, null, FIRST)).rejects.toThrow(
      UnknownMailError,
    );
    expect(mails.awaitedReceipt).toEqual([]);
  });

  it("un refus du fournisseur remonte à l'écran de l'essai", async () => {
    const mails = new ScopeWitnessMails();
    mails.failWith = new Error("Resend a refusé l'envoi");
    const sender = new SpecimenMailTrialSender(mails);

    await expect(
      sender.send("staff@lfc.fr", "customer.access-opened", "fr", TEXTS, null, FIRST),
    ).rejects.toThrow("Resend a refusé l'envoi");
  });
});
