import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import { pricingCompanyOf, PUBLIC_VIEWER } from "../../domain/catalog-viewer.js";
import { CompanyClosedOrderRefusedError } from "../../domain/errors/company-closed-order-refused.error.js";
import {
  ServedCompanyReader,
  type ServedCompany,
} from "../../domain/ports/served-company.reader.js";
import { InMemoryServedCompanies } from "../../infrastructure/in-memory-served-companies.js";
import { CatalogViewers } from "../catalog-viewers.service.js";

const COMPANY = "co_1";
const PRINCIPAL = "co_parent";

function viewersAt(status: StandingCompanyStatus): CatalogViewers {
  return new CatalogViewers(
    new InMemoryServedCompanies(new Map([[COMPANY, status]]), new Map([[COMPANY, PRINCIPAL]])),
  );
}

/** Aucune société connue : le port rend `null`. */
class NoCompany extends ServedCompanyReader {
  servedOf(): Promise<ServedCompany | null> {
    return Promise.resolve(null);
  }
}

describe("CatalogViewers — la fabrique unique (plan pros en cours d'inscription, P0)", () => {
  describe.each<[StandingCompanyStatus]>([["active"], ["pending"]])("société %s", (status) => {
    it("lit et facture en pro, avec sa société au tarificateur", async () => {
      const viewers = viewersAt(status);
      const read = await viewers.forCompany(COMPANY, "served_and_locked");
      const billed = await viewers.forBilling(COMPANY, "served_and_locked");
      expect(read).toEqual({
        kind: "pro",
        holders: { companyId: COMPANY, activePrincipalId: PRINCIPAL },
        show: "served_and_locked",
      });
      expect(billed).toEqual(read);
      expect(pricingCompanyOf(billed)).toBe(COMPANY);
      expect((await viewers.forKeptLines(COMPANY)).kind).toBe("pro");
    });
  });

  /** Régression : une suspendue lisait le rayon pro, sa mercuriale, et le devis tarifait pro. */
  it("sert une suspendue au public, sans société au tarificateur", async () => {
    const viewers = viewersAt("suspended");
    const read = await viewers.forCompany(COMPANY, "served_and_locked");
    const billed = await viewers.forBilling(COMPANY, "served_and_locked");
    expect(read).toBe(PUBLIC_VIEWER);
    expect(billed).toBe(PUBLIC_VIEWER);
    expect(pricingCompanyOf(billed)).toBeNull();
    expect(await viewers.forKeptLines(COMPANY)).toBe(PUBLIC_VIEWER);
  });

  /** Régression : une terminée devisait et commandait au prix pro. */
  it("refuse de facturer une terminée, par son nom", async () => {
    const viewers = viewersAt("terminated");
    await expect(viewers.forBilling(COMPANY, "served")).rejects.toThrow(
      CompanyClosedOrderRefusedError,
    );
    await expect(viewers.forBilling(COMPANY, "served")).rejects.toThrow("Ce compte est clos");
  });

  it("laisse une terminée lire le rayon public", async () => {
    expect(await viewersAt("terminated").forCompany(COMPANY)).toBe(PUBLIC_VIEWER);
  });

  it("sert le public sans société, sans rien lire", async () => {
    const served = new InMemoryServedCompanies();
    const viewers = new CatalogViewers(served);
    expect(await viewers.forCompany(null)).toBe(PUBLIC_VIEWER);
    expect(await viewers.forBilling(null, "served")).toBe(PUBLIC_VIEWER);
    expect(served.asked).toEqual([]);
  });

  it("sert une société inconnue au public", async () => {
    const viewers = new CatalogViewers(new NoCompany());
    expect(await viewers.forCompany(COMPANY)).toBe(PUBLIC_VIEWER);
    expect(await viewers.forBilling(COMPANY, "served")).toBe(PUBLIC_VIEWER);
    expect(await viewers.regarding(COMPANY)).toEqual({
      kind: "staff",
      audience: "pro",
      regarding: { companyId: COMPANY, activePrincipalId: null },
    });
  });

  it("étiquette pour le personnel quel que soit le statut", async () => {
    const staff = await viewersAt("terminated").regarding(COMPANY);
    expect(staff.regarding).toEqual({ companyId: COMPANY, activePrincipalId: PRINCIPAL });
  });
});
