import {
  type StaffContact,
  StaffContacts,
} from "../../../../staff/directory/domain/staff-contacts.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../channels/requests/__tests__/recording-mail.js";
import {
  StaffMemberNotFoundError,
  StaffMemberUnreachableError,
} from "../../../channels/requests/staff-member-mail.js";
import { BlockStaffMemberMail } from "../block-staff-member-mail.js";

class FixedContacts extends StaffContacts {
  constructor(private readonly contacts: readonly StaffContact[]) {
    super();
  }
  contactsOf(ids: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    return Promise.resolve(
      new Map(
        this.contacts
          .filter((contact) => ids.includes(contact.staffUserId))
          .map((contact) => [contact.staffUserId, contact]),
      ),
    );
  }
}

const ANNE: StaffContact = {
  staffUserId: "staff_anne",
  firstName: "Anne",
  lastName: "Compta",
  email: "anne@lfc.test",
  jobTitle: "",
  active: true,
};

const uow = new OpenableUnitOfWork();

function sendTo(staffUserId: string, contacts: readonly StaffContact[]) {
  const mails = new RecordingMail(uow);
  const port = new BlockStaffMemberMail(new FixedContacts(contacts), mails);
  const sent = uow.run(() =>
    port.sendToStaffMember({
      staffUserId,
      template: "staff.pay-link-test",
      data: { payUrl: "https://app.lfc.test/payer/tok" },
      subjects: [{ type: "pay_link_test", id: "plt_1" }],
      idempotencyKey: "mail:payment.pay_link_test:plt_1",
    }),
  );
  return { mails, sent };
}

describe("écrire à un membre du staff par sa fiche", () => {
  it("résout l'adresse de la fiche et garde la clé de l'appelant", async () => {
    const { mails, sent } = sendTo("staff_anne", [ANNE]);
    await expect(sent).resolves.toEqual({ requestId: "mail_1" });
    expect(mails.queued).toEqual([
      {
        template: "staff.pay-link-test",
        to: "anne@lfc.test",
        data: { payUrl: "https://app.lfc.test/payer/tok" },
        subjects: [{ type: "pay_link_test", id: "plt_1" }],
        idempotencyKey: "mail:payment.pay_link_test:plt_1",
        replyTo: undefined,
      },
    ]);
  });

  it("refuse une fiche inconnue, sans rien écrire", async () => {
    const { mails, sent } = sendTo("staff_ghost", [ANNE]);
    await expect(sent).rejects.toThrow(StaffMemberNotFoundError);
    expect(mails.queued).toEqual([]);
  });

  it("refuse une fiche suspendue, et une fiche sans adresse", async () => {
    const suspended = sendTo("staff_anne", [{ ...ANNE, active: false }]);
    await expect(suspended.sent).rejects.toThrow(StaffMemberUnreachableError);
    const blank = sendTo("staff_anne", [{ ...ANNE, email: " " }]);
    await expect(blank.sent).rejects.toThrow(StaffMemberUnreachableError);
    expect([...suspended.mails.queued, ...blank.mails.queued]).toEqual([]);
  });
});
