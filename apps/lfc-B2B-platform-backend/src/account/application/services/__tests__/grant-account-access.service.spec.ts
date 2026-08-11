import type { B2bMailer } from "../../../../infra/mailer/mailer.module.js";
import {
  CompanyMemberRepository,
  type CompanyMemberRecord,
  type MemberToCreate,
} from "../../../domain/ports/company-member.repository.js";
import {
  CustomerIdentityPort,
  type IdentityToProvision,
  type ProvisionedIdentity,
} from "../../../domain/ports/customer-identity.port.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { GrantAccountAccess, type AccessToGrant } from "../grant-account-access.service.js";

/** Un rattachement enregistré, tel que le double le capture. */
interface Attachment {
  readonly userId: string;
  readonly companyId: string;
  readonly role: CompanyRole;
}

class FakeMembers extends CompanyMemberRepository {
  readonly created: MemberToCreate[] = [];
  readonly attached: Attachment[] = [];

  constructor(
    private readonly knownUserId: string | null = null,
    private readonly alreadyMember = false,
  ) {
    super();
  }

  findUserIdByEmail(): Promise<string | null> {
    return Promise.resolve(this.knownUserId);
  }

  createInvited(input: MemberToCreate): Promise<string> {
    this.created.push(input);
    return Promise.resolve("user_new");
  }

  attach(userId: string, companyId: string, role: CompanyRole): Promise<void> {
    this.attached.push({ userId, companyId, role });
    return Promise.resolve();
  }

  findMember(): Promise<CompanyMemberRecord | null> {
    return Promise.resolve(
      this.alreadyMember
        ? {
            userId: "user_known",
            email: "camille@halles.fr",
            firstName: "Camille",
            lastName: "Rousseau",
            phone: "",
            role: "company_admin",
            status: "active",
            joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          }
        : null,
    );
  }
}

class FakeIdentity extends CustomerIdentityPort {
  readonly provisioned: IdentityToProvision[] = [];

  changeEmail(): Promise<void> {
    return Promise.resolve();
  }

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    this.provisioned.push(input);
    return Promise.resolve({ subject: "auth0|1", passwordSetupUrl: "https://tickets/abc" });
  }
}

/**
 * Un envoi observé. On note **si** le corps porte un lien de mot de passe plutôt
 * que sa valeur : c'est le fait qui compte (un client déjà connu ne doit pas en
 * recevoir), et lire une clé sur une union de gabarits ne se type pas.
 */
interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly carriesPasswordLink: boolean;
}

/** Mailer doublé — capture les envois, ou refuse pour simuler un canal en panne. */
function fakeMailer(failing = false): {
  readonly mailer: B2bMailer;
  readonly sent: SentMail[];
} {
  const sent: SentMail[] = [];
  const mailer: B2bMailer = {
    send: (args): Promise<void> => {
      if (failing) {
        return Promise.reject(new Error("canal indisponible"));
      }
      sent.push({
        to: args.to,
        template: args.template,
        carriesPasswordLink: "passwordSetupUrl" in args.data,
      });
      return Promise.resolve();
    },
  };
  return { mailer, sent };
}

const INPUT: AccessToGrant = {
  companyId: "cmp_1",
  companyName: "Café des Halles",
  email: "camille@halles.fr",
  firstName: "Camille",
  lastName: "Rousseau",
  phone: "0600000000",
  role: "company_admin",
  invitedBy: "staff-sub",
};

describe("GrantAccountAccess", () => {
  it("provisionne une identité et envoie le lien de mot de passe à un inconnu", async () => {
    const members = new FakeMembers(null);
    const identity = new FakeIdentity();
    const { mailer, sent } = fakeMailer();

    const granted = await new GrantAccountAccess(members, identity, mailer).grant(INPUT);

    expect(granted).toEqual({ userId: "user_new", identityCreated: true, mailSent: true });
    expect(identity.provisioned).toHaveLength(1);
    expect(members.attached).toEqual([
      { userId: "user_new", companyId: "cmp_1", role: "company_admin" },
    ]);
    expect(sent[0]?.template).toBe("customer.access-opened");
    expect(sent[0]?.carriesPasswordLink).toBe(true);
  });

  it("RATTACHE un client déjà connu au lieu de lui refaire une identité", async () => {
    // Le second établissement d'un restaurateur : deux identités lui donneraient
    // deux mots de passe pour une seule boîte e-mail, et deux espaces.
    const members = new FakeMembers("user_known");
    const identity = new FakeIdentity();
    const { mailer, sent } = fakeMailer();

    const granted = await new GrantAccountAccess(members, identity, mailer).grant(INPUT);

    expect(granted).toEqual({ userId: "user_known", identityCreated: false, mailSent: true });
    expect(identity.provisioned).toEqual([]);
    expect(members.created).toEqual([]);
    expect(members.attached).toEqual([
      { userId: "user_known", companyId: "cmp_1", role: "company_admin" },
    ]);
    // Pas de lien de mot de passe : il en a déjà un.
    expect(sent[0]?.template).toBe("customer.company-attached");
    expect(sent[0]?.carriesPasswordLink).toBe(false);
  });

  it("ne rattache pas deux fois quelqu'un qui l'est déjà", async () => {
    const members = new FakeMembers("user_known", true);
    const { mailer } = fakeMailer();

    await new GrantAccountAccess(members, new FakeIdentity(), mailer).grant(INPUT);

    expect(members.attached).toEqual([]);
  });

  it("garde l'accès quand l'e-mail ne part pas, et le DIT", async () => {
    // L'accès est en base ; le défaire pour un canal en panne ferait perdre le
    // travail du commercial. On le signale, il renverra le lien.
    const members = new FakeMembers(null);
    const { mailer } = fakeMailer(true);

    const granted = await new GrantAccountAccess(members, new FakeIdentity(), mailer).grant(INPUT);

    expect(granted.mailSent).toBe(false);
    expect(members.attached).toHaveLength(1);
  });
});
