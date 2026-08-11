import type { B2bMailer } from "../../../../infra/mailer/mailer.module.js";
import {
  AccountDisabledError,
  CompanyAlreadyHasOwnerError,
} from "../../../domain/errors/account-errors.js";
import {
  CompanyMemberRepository,
  type CompanyMemberRecord,
  type KnownAccount,
  type MemberStatus,
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

/** Ce que la base sait déjà : une personne (ou non), et un détenteur (ou non). */
interface Existing {
  readonly account?: KnownAccount;
  readonly owner?: KnownAccount;
}

class FakeMembers extends CompanyMemberRepository {
  readonly created: MemberToCreate[] = [];
  readonly attached: Attachment[] = [];

  constructor(private readonly existing: Existing = {}) {
    super();
  }

  findAccountByEmail(): Promise<KnownAccount | null> {
    return Promise.resolve(this.existing.account ?? null);
  }

  findOwner(): Promise<KnownAccount | null> {
    return Promise.resolve(this.existing.owner ?? null);
  }

  createInvited(input: MemberToCreate): Promise<string> {
    this.created.push(input);
    return Promise.resolve("user_new");
  }

  attach(userId: string, companyId: string, role: CompanyRole): Promise<void> {
    this.attached.push({ userId, companyId, role });
    return Promise.resolve();
  }

  alignRole(): Promise<void> {
    return Promise.resolve();
  }

  findMember(): Promise<CompanyMemberRecord | null> {
    return Promise.resolve(null);
  }
}

class FakeIdentity extends CustomerIdentityPort {
  readonly provisioned: IdentityToProvision[] = [];
  readonly reissuedFor: string[] = [];

  changeEmail(): Promise<void> {
    return Promise.resolve();
  }

  provision(input: IdentityToProvision): Promise<ProvisionedIdentity> {
    this.provisioned.push(input);
    return Promise.resolve({ subject: "auth0|1", passwordSetupUrl: "https://tickets/neuf" });
  }

  issuePasswordLink(subject: string): Promise<string> {
    this.reissuedFor.push(subject);
    return Promise.resolve("https://tickets/renvoye");
  }
}

/**
 * Un envoi observé. On note **si** le corps porte un lien de mot de passe plutôt
 * que sa valeur : c'est le fait qui compte — qui n'a jamais posé de mot de passe
 * doit en recevoir un, et lire une clé sur une union de gabarits ne se type pas.
 */
interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly carriesPasswordLink: boolean;
}

/**
 * Mailer doublé — capture les envois, refuse pour simuler un canal en panne, ou
 * tourne **à blanc** (`enabled: false`) comme lorsqu'aucune clé n'est configurée.
 */
function fakeMailer(options: { readonly failing?: boolean; readonly enabled?: boolean } = {}): {
  readonly mailer: B2bMailer;
  readonly sent: SentMail[];
} {
  const { failing = false, enabled = true } = options;
  const sent: SentMail[] = [];
  const mailer: B2bMailer = {
    enabled,
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

/** Une personne connue, dans l'état voulu. */
function account(status: MemberStatus, userId = "user_known"): KnownAccount {
  return { userId, subject: "auth0|known", status };
}

const INPUT: AccessToGrant = {
  companyId: "cmp_1",
  companyName: "Café des Halles",
  email: "camille@halles.fr",
  firstName: "Camille",
  lastName: "Rousseau",
  phone: "0600000000",
  role: "owner",
  invitedBy: "staff-sub",
};

/** Le service, monté sur des doubles — aucun réseau, aucune base. */
function granter(members: FakeMembers, mailer: B2bMailer, identity = new FakeIdentity()) {
  return { service: new GrantAccountAccess(members, identity, mailer), identity };
}

describe("GrantAccountAccess — personne inconnue", () => {
  it("provisionne une identité et envoie le lien de mot de passe", async () => {
    const members = new FakeMembers();
    const { mailer, sent } = fakeMailer();
    const { service, identity } = granter(members, mailer);

    const granted = await service.grant(INPUT);

    expect(granted).toEqual({ userId: "user_new", outcome: "identity_created", mailSent: true });
    expect(identity.provisioned).toHaveLength(1);
    expect(members.attached).toEqual([{ userId: "user_new", companyId: "cmp_1", role: "owner" }]);
    expect(sent[0]?.template).toBe("customer.access-opened");
    expect(sent[0]?.carriesPasswordLink).toBe(true);
  });
});

describe("GrantAccountAccess — connue, mais SANS mot de passe", () => {
  it("RENVOIE un vrai lien plutôt qu'un e-mail sans rien dedans", async () => {
    // C'est l'état de tout compte ouvert pendant que l'e-mail ne partait pas.
    // Le traiter comme un client installé lui écrirait « utilisez vos
    // identifiants habituels » alors qu'il n'en a jamais eu.
    const members = new FakeMembers({ account: account("invited") });
    const { mailer, sent } = fakeMailer();
    const { service, identity } = granter(members, mailer);

    const granted = await service.grant(INPUT);

    expect(granted).toEqual({ userId: "user_known", outcome: "link_reissued", mailSent: true });
    // Aucune seconde identité : la sienne existe, on lui rouvre juste la porte.
    expect(identity.provisioned).toEqual([]);
    expect(identity.reissuedFor).toEqual(["auth0|known"]);
    expect(sent[0]?.template).toBe("customer.access-opened");
    expect(sent[0]?.carriesPasswordLink).toBe(true);
  });

  it("rattache aussi la société au passage", async () => {
    const members = new FakeMembers({ account: account("invited") });
    const { mailer } = fakeMailer();

    await granter(members, mailer).service.grant(INPUT);

    expect(members.attached).toEqual([{ userId: "user_known", companyId: "cmp_1", role: "owner" }]);
  });
});

describe("GrantAccountAccess — cliente active", () => {
  it("RATTACHE sans refaire d'identité ni renvoyer de lien", async () => {
    // Le second établissement d'un restaurateur : deux identités lui donneraient
    // deux mots de passe pour une seule boîte, et un lien de mot de passe
    // laisserait croire que le sien ne marche plus.
    const members = new FakeMembers({ account: account("active") });
    const { mailer, sent } = fakeMailer();
    const { service, identity } = granter(members, mailer);

    const granted = await service.grant(INPUT);

    expect(granted).toEqual({ userId: "user_known", outcome: "attached", mailSent: true });
    expect(identity.provisioned).toEqual([]);
    expect(identity.reissuedFor).toEqual([]);
    expect(sent[0]?.template).toBe("customer.company-attached");
    expect(sent[0]?.carriesPasswordLink).toBe(false);
  });

  it("aligne le rôle d'un rattachement déjà en place", async () => {
    // `attach` est un upsert : ré-ouvrir un accès ne doit ni échouer ni laisser
    // un rôle périmé derrière l'écran.
    const known = account("active");
    const members = new FakeMembers({ account: known, owner: known });
    const { mailer } = fakeMailer();

    await granter(members, mailer).service.grant({ ...INPUT, role: "billing" });

    expect(members.attached).toEqual([
      { userId: "user_known", companyId: "cmp_1", role: "billing" },
    ]);
  });
});

describe("GrantAccountAccess — les refus", () => {
  it("REFUSE de rouvrir l'accès d'un compte désactivé", async () => {
    // `disabled` est une décision prise sur quelqu'un : un clic sur un bouton
    // d'invitation ne la renverse pas discrètement.
    const members = new FakeMembers({ account: account("disabled") });
    const { mailer, sent } = fakeMailer();

    await expect(granter(members, mailer).service.grant(INPUT)).rejects.toBeInstanceOf(
      AccountDisabledError,
    );
    expect(members.attached).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("REFUSE un second détenteur", async () => {
    // `owner` se constate, il ne s'ajoute pas : deux détenteurs, ce serait deux
    // personnes également légitimes sans règle pour trancher.
    const members = new FakeMembers({ owner: account("active", "user_autre") });
    const { mailer } = fakeMailer();

    await expect(granter(members, mailer).service.grant(INPUT)).rejects.toBeInstanceOf(
      CompanyAlreadyHasOwnerError,
    );
    expect(members.attached).toEqual([]);
  });

  it("laisse le détenteur en place se ré-ouvrir un accès", async () => {
    // Le même : ce n'est pas un rival, c'est lui.
    const known = account("invited");
    const members = new FakeMembers({ account: known, owner: known });
    const { mailer } = fakeMailer();

    await expect(granter(members, mailer).service.grant(INPUT)).resolves.toMatchObject({
      outcome: "link_reissued",
    });
  });

  it("garde l'accès quand l'e-mail ne part pas, et le DIT", async () => {
    // L'accès est en base ; le défaire pour un canal en panne ferait perdre le
    // travail du commercial. On le signale, il renverra le lien — et ce renvoi
    // portera vraiment un lien.
    const members = new FakeMembers();
    const { mailer } = fakeMailer({ failing: true });

    const granted = await granter(members, mailer).service.grant(INPUT);

    expect(granted.mailSent).toBe(false);
    expect(members.attached).toHaveLength(1);
  });
});

describe("GrantAccountAccess — un canal à blanc ne ment pas", () => {
  it("ne dit PAS « envoyé » quand aucun fournisseur n'est branché", async () => {
    // Sans clé, le mailer rend le gabarit, le journalise et n'envoie rien : il
    // résout donc sans erreur. Répondre « envoyé » ferait attendre au client un
    // e-mail que personne n'a posté.
    const members = new FakeMembers();
    const { mailer, sent } = fakeMailer({ enabled: false });

    const granted = await granter(members, mailer).service.grant(INPUT);

    expect(granted.mailSent).toBe(false);
    // Le gabarit est quand même rendu : une erreur de gabarit doit se voir en
    // local, pas le jour où la clé arrive.
    expect(sent[0]?.template).toBe("customer.access-opened");
  });
});
