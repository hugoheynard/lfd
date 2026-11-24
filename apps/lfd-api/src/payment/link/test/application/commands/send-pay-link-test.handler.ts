import type { CreatedPayLinkTest } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffMemberMail } from "../../../../../mail/channels/requests/staff-member-mail.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import type { IntentRecord } from "../../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../../staff/directory/domain/staff-author-directory.js";
import { PayLinks } from "../../../../channels/requests/pay-links.js";
import { PayLinkTestUrlGoneError } from "../../domain/errors/pay-link-test-errors.js";
import { assertDailyRoom, PayLinkTest } from "../../domain/pay-link-test.js";
import {
  PAY_LINK_TEST_ORIGIN,
  PAY_LINK_TEST_PAYER_LABEL,
  payLinkTestSubject,
} from "../../domain/pay-link-test-subject.js";
import { PayLinkTestRepository } from "../../domain/ports/pay-link-test.repository.js";
import { SendPayLinkTestCommand } from "./send-pay-link-test.command.js";

/** Ce que le scellé d'intention garde : l'identifiant seul, jamais l'URL (elle porte le jeton). */
interface SealedTest {
  readonly id: string;
}

/**
 * Envoie un **lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») —
 * dans UNE transaction, sans réseau : le verrou de l'envoi, le plafond du
 * jour de Paris compté sous lui, l'essai, son lien `PayLinks.open` du sujet
 * `payment_test`, et l'e-mail au membre choisi par `StaffMemberMail` — le
 * bloc `mail` résout l'adresse, et refuse un membre inconnu ou suspendu :
 * la transaction tombe alors entière, rien n'est envoyé ni compté.
 *
 * **Une fois par intention** (sujet : le destinataire) : un double clic rend
 * le même essai. Le scellé ne garde que l'identifiant ; le rejeu relit
 * l'adresse par `PayLinks.urlOf`.
 *
 * @sans-journal La trace de l'envoi est sa ligne `payment.pay_link_test`,
 * qui naît avec son auteur et son instant, et que l'écran liste ; le lien
 * porte le même auteur. Rien n'est encaissé ici : l'encaissement et le
 * remboursement ont la trace du bloc, au webhook et à l'exécuteur.
 */
@CommandHandler(SendPayLinkTestCommand)
export class SendPayLinkTestHandler implements ICommandHandler<
  SendPayLinkTestCommand,
  CreatedPayLinkTest
> {
  constructor(
    private readonly tests: PayLinkTestRepository,
    private readonly payLinks: PayLinks,
    private readonly staffMail: StaffMemberMail,
    private readonly authors: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {PayLinkTestDailyLimitError} le plafond du jour est atteint.
   * @throws {StaffMemberNotFoundError} aucun membre sous cet identifiant.
   * @throws {StaffMemberUnreachableError} membre suspendu ou sans adresse.
   * @throws {PayLinkOriginWithoutRootError} l'adresse publique n'est pas configurée.
   * @throws {PayLinkTestUrlGoneError} rejeu d'un essai dont l'adresse ne se relit plus.
   */
  async execute(command: SendPayLinkTestCommand): Promise<CreatedPayLinkTest> {
    // L'adresse rendue par l'ouverture ; absente quand l'intention est rejouée.
    const opened: { url: string | null } = { url: null };
    const { id } = await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SEND_TEST_GESTURE,
        subject: intentSubject(command.recipientStaffUserId),
      },
      SEALED_TEST,
      async (seal) => {
        const sent = await this.send(command, seal);
        opened.url = sent.url;
        return { id: sent.id };
      },
    );
    const url = opened.url ?? (await this.payLinks.urlOf(payLinkTestSubject(id)));
    if (url === null) {
      throw new PayLinkTestUrlGoneError(id);
    }
    return { id, url };
  }

  private async send(
    command: SendPayLinkTestCommand,
    seal: (sealed: SealedTest) => Promise<void>,
  ): Promise<CreatedPayLinkTest> {
    // Le nom de l'auteur, figé sur le lien pour l'avis à la comptabilité.
    const byLabel = (await this.authors.identify([command.staffUserId])).nameOf(
      command.staffUserId,
    );
    return this.uow.run(async () => {
      await this.tests.lockSending();
      const now = this.clock.now();
      assertDailyRoom(await this.tests.countSentOnParisDayOf(now));
      const test = PayLinkTest.send({
        id: this.ids.next(),
        createdAt: now,
        createdByStaffId: command.staffUserId,
      });
      await this.tests.add(test);
      const { url } = await this.payLinks.open(payLinkTestSubject(test.id), {
        origin: PAY_LINK_TEST_ORIGIN,
        payerLabel: PAY_LINK_TEST_PAYER_LABEL,
        by: command.staffUserId,
        byLabel,
      });
      await this.staffMail.sendToStaffMember({
        staffUserId: command.recipientStaffUserId,
        template: "staff.pay-link-test",
        data: { payUrl: url },
        subjects: [{ type: "pay_link_test", id: test.id }],
        idempotencyKey: `mail:payment.pay_link_test:${test.id}`,
      });
      await seal({ id: test.id });
      return { id: test.id, url };
    });
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const SEND_TEST_GESTURE = "payment.send-pay-link-test";

const SEALED_TEST: IntentCodec<SealedTest> = {
  write: (sealed): IntentRecord => ({ id: sealed.id }),
  read: (record, gesture) => ({ id: readIntentString(record, "id", gesture) }),
};
