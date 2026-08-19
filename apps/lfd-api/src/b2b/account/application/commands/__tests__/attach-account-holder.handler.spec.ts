import { Company } from "../../../domain/entities/company.js";
import {
  CompanyAlreadyHasOwnerError,
  CompanyNotFoundError,
  InvalidEmailError,
} from "../../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import {
  AccountAccessGranter,
  type AccessGranted,
  type AccessToGrant,
} from "../../services/grant-account-access.service.js";
import { AttachAccountHolderCommand } from "../attach-account-holder.command.js";
import { AttachAccountHolderHandler } from "../attach-account-holder.handler.js";

const HOLDER = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@halles.fr",
  phone: "06 11 22 33 44",
};

/** Accès doublé : capture la demande, ou échoue pour simuler un canal absent. */
class FakeAccess extends AccountAccessGranter {
  readonly granted: AccessToGrant[] = [];
  constructor(private readonly outcome: AccessGranted | Error) {
    super();
  }

  grant(input: AccessToGrant): Promise<AccessGranted> {
    this.granted.push(input);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

/** Une société **ouverte sur sa seule enseigne** — le cas que ce geste comble. */
function withoutHolder(): Company {
  return Company.reconstitute({
    id: "cmp_1",
    raisonSociale: "",
    enseigne: "Café des Halles",
    formeJuridique: "",
    siret: "",
    tvaIntracom: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

interface Doubles {
  readonly handler: AttachAccountHolderHandler;
  readonly access: FakeAccess;
  /** Les sociétés réellement écrites — le témoin de ce qui a été retenu. */
  readonly saved: Company[];
}

function doubles(
  options: { company?: Company | null; access?: AccessGranted | Error } = {},
): Doubles {
  const saved: Company[] = [];
  const company = options.company === undefined ? withoutHolder() : options.company;
  const companies: CompanyRepository = {
    load: () => Promise.resolve(company),
    save: (written: Company) => {
      saved.push(written);
      return Promise.resolve();
    },
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("cmp_owned"),
    declareUnowned: () => Promise.resolve("cmp_unowned"),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
    saveKbisCertification: () => Promise.resolve(),
  };

  const access = new FakeAccess(
    options.access ?? { userId: "user_1", outcome: "identity_created", mailSent: true },
  );
  return { handler: new AttachAccountHolderHandler(companies, access), access, saved };
}

function command(): AttachAccountHolderCommand {
  return new AttachAccountHolderCommand("cmp_1", HOLDER, "staff-sub");
}

describe("AttachAccountHolderHandler", () => {
  it("rattache le détenteur et lui ouvre l'accès en propriétaire", async () => {
    const { handler, access, saved } = doubles();

    await expect(handler.execute(command())).resolves.toEqual({ mailSent: true });

    expect(access.granted[0]?.email).toBe("camille@halles.fr");
    // Le rôle ne se choisit pas : celui dont l'adresse ouvre le compte EST le
    // détenteur.
    expect(access.granted[0]?.role).toBe("owner");
    // Le nom d'USAGE dans l'e-mail : la raison sociale est vide ici, et un
    // message sans nom de maison n'aide personne.
    expect(access.granted[0]?.companyName).toBe("Café des Halles");
    expect(saved[0]?.contact?.email.value).toBe("camille@halles.fr");
  });

  it("refuse de remplacer un détenteur en place, sans rien tenter", async () => {
    // En changer est une autre décision, qui mérite son propre geste — et un
    // second propriétaire ne doit pas naître d'un rattachement de rattrapage.
    const taken = withoutHolder();
    taken.attachHolder(ContactDetails.create(HOLDER));
    const { handler, access, saved } = doubles({ company: taken });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CompanyAlreadyHasOwnerError);
    expect(access.granted).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("n'écrit RIEN quand le fournisseur d'identité tombe", async () => {
    // C'est ce qui rend le geste rejouable : une fiche portant déjà le
    // détenteur ferait refuser la seconde tentative par l'agrégat, et le
    // compte resterait sans accès pour toujours.
    const { handler, saved } = doubles({ access: new Error("canal indisponible") });

    await expect(handler.execute(command())).rejects.toThrow("canal indisponible");
    expect(saved).toEqual([]);
  });

  it("dit quand l'e-mail n'est pas parti, sans défaire le rattachement", async () => {
    const { handler, saved } = doubles({
      access: { userId: "user_1", outcome: "identity_created", mailSent: false },
    });

    await expect(handler.execute(command())).resolves.toEqual({ mailSent: false });
    expect(saved).toHaveLength(1);
  });

  it("refuse une adresse invalide avant tout effet de bord", async () => {
    const { handler, access } = doubles();
    const bad = new AttachAccountHolderCommand("cmp_1", { ...HOLDER, email: "" }, "staff-sub");

    await expect(handler.execute(bad)).rejects.toBeInstanceOf(InvalidEmailError);
    expect(access.granted).toEqual([]);
  });

  it("404 sur une société inconnue", async () => {
    const { handler } = doubles({ company: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});
