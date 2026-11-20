import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompanyStanding } from "../../../../shared/company-standing/domain/company-standing.js";
import type { StandingRole } from "../../../../shared/company-standing/domain/standing-role.js";
import { Company } from "../../../domain/entities/company.js";
import type { SubAccountMenu } from "../../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { NotASubAccountError } from "../../../domain/errors/hierarchy-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuSetEvent } from "../../../domain/events/sub-account-menu-acts.event.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { SubAccountMenuAccessReader } from "../../../domain/ports/sub-account-menu-access.reader.js";
import { SubAccountMenuRepository } from "../../../domain/ports/sub-account-menu.repository.js";
import type { RequestedMenu } from "../../../domain/services/whole-menu.js";
import { HierarchyPlace } from "../../../domain/value-objects/hierarchy-place.js";
import { SubAccountMenuWriting } from "../../services/sub-account-menu-writing.js";
import { SetSubAccountMenuByStaffCommand } from "../set-sub-account-menu-by-staff.command.js";
import { SetSubAccountMenuByStaffHandler } from "../set-sub-account-menu-by-staff.handler.js";
import { SetSubAccountMenuCommand } from "../set-sub-account-menu.command.js";
import { SetSubAccountMenuHandler } from "../set-sub-account-menu.handler.js";

const SITE = "co_site";
const NOW = new Date(Date.UTC(2030, 0, 1));

function site(parentCompanyId: string | null): Company {
  return Company.reconstitute({
    id: SITE,
    raisonSociale: "Chalet SAS",
    enseigne: "Chalet du Club",
    formeJuridique: "sas",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: false,
      groupWithoutDelivery: false,
    }),
  });
}

class OneCompany extends CompanyRepository {
  constructor(private readonly company: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.company);
  }
  save(): Promise<void> {
    return Promise.reject(new TypeError("la société ne se réécrit pas pour sa carte"));
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("c");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("c");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    return Promise.resolve(null);
  }
}

class InMemoryMenus extends SubAccountMenuRepository {
  readonly saved: SubAccountMenu[] = [];
  private stored: SubAccountMenu | null = null;
  load(): Promise<SubAccountMenu | null> {
    return Promise.resolve(this.stored);
  }
  save(menu: SubAccountMenu): Promise<void> {
    this.saved.push(menu);
    this.stored = menu;
    return Promise.resolve();
  }
}

class FixedStanding extends SubAccountMenuAccessReader {
  constructor(private readonly standing: CompanyStanding | null) {
    super();
  }
  standingOf(): Promise<CompanyStanding | null> {
    return Promise.resolve(this.standing);
  }
}

function standing(own: StandingRole | null, viaRole: StandingRole | null): CompanyStanding {
  return {
    companyStatus: "active",
    own,
    ownAccepted: own !== null,
    via: viaRole === null ? null : { companyId: "co_principal", name: "Club", role: viaRole },
  };
}

const NO_PASTRY: RequestedMenu = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_patisserie", effect: "exclude" }],
};

function scene(company: Company | null, place: CompanyStanding | null = null) {
  const menus = new InMemoryMenus();
  const events = new RecordingPublisher();
  const writing = new SubAccountMenuWriting(
    new OneCompany(company),
    menus,
    new FixedIdGenerator("ent"),
    new FixedClock(NOW),
  );
  const uow = new DirectUnitOfWork();
  return {
    menus,
    events,
    principal: new SetSubAccountMenuHandler(new FixedStanding(place), writing, menus, events, uow),
    staff: new SetSubAccountMenuByStaffHandler(writing, menus, events, uow),
  };
}

describe("SetSubAccountMenuHandler — le principal pose la carte d'un site", () => {
  it.each(["owner", "admin"] as const)(
    "le %s du principal la pose, signée de son nom",
    async (role) => {
      const { principal, menus, events } = scene(site("co_principal"), standing(null, role));

      await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));

      expect(menus.saved).toHaveLength(1);
      expect(menus.saved[0]?.stamp).toEqual({
        author: { kind: "customer", userId: "usr_1" },
        at: NOW,
      });
      expect(events.traced.map((event) => event.journalFact())).toEqual([
        {
          type: "company.sub_account_menu_set",
          subjectType: "company",
          subjectId: SITE,
          payload: {
            subjectLabel: "Chalet du Club",
            mode: "except",
            offMenu: "visible_locked",
            included: 0,
            excluded: 1,
          },
        },
      ]);
    },
  );

  it("🔴 le propriétaire PROPRE du site est refusé, et rien n'est écrit", async () => {
    const { principal, menus, events } = scene(site("co_principal"), standing("owner", null));

    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
    expect(menus.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("un `orders` du principal est refusé", async () => {
    const { principal } = scene(site("co_principal"), standing(null, "orders"));
    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
  });

  it("qui n'atteint pas le site reçoit le refus d'une société inconnue", async () => {
    const { principal } = scene(site("co_principal"), null);
    await expect(
      principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  it("rejouée à l'identique, n'écrit ni ne journalise une seconde fois", async () => {
    const { principal, menus, events } = scene(site("co_principal"), standing(null, "admin"));

    await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));
    await principal.execute(new SetSubAccountMenuCommand("usr_1", SITE, NO_PASTRY));

    expect(menus.saved).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });
});

describe("SetSubAccountMenuByStaffHandler — le staff pose la carte depuis la fiche", () => {
  it("la pose signée du staff, et l'événement le dit à ses abonnés", async () => {
    const { staff, menus, events } = scene(site("co_principal"));

    await staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY));

    expect(menus.saved[0]?.stamp.author).toEqual({ kind: "staff", staffId: "stf_1" });
    expect(menus.saved[0]?.entries).toEqual([
      { id: "ent_000001", level: "family", ref: "fam_patisserie", effect: "exclude" },
    ]);
    const [event] = events.traced;
    expect(event).toBeInstanceOf(SubAccountMenuSetEvent);
    expect(event instanceof SubAccountMenuSetEvent ? event.author.kind : null).toBe("staff");
  });

  it("refuse une société sans principal", async () => {
    const { staff, menus } = scene(site(null));
    await expect(
      staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY)),
    ).rejects.toThrow(NotASubAccountError);
    expect(menus.saved).toHaveLength(0);
  });

  it("refuse une société inconnue", async () => {
    const { staff } = scene(null);
    await expect(
      staff.execute(new SetSubAccountMenuByStaffCommand(SITE, "stf_1", NO_PASTRY)),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});
