import type { StaffSuggestionChoicesView, StaffSuggestionSiteChoice } from "@lfd/contracts";

import { SuggestionChoicesReader } from "../../../domain/ports/suggestion-choices.reader.js";
import { SuggestionSiteChoicesReader } from "../../../domain/ports/suggestion-site.reader.js";
import { ListStaffSuggestionChoicesHandler } from "../list-staff-suggestion-choices.handler.js";

class Catalogue extends SuggestionChoicesReader {
  choices(): Promise<Omit<StaffSuggestionChoicesView, "sites">> {
    return Promise.resolve({
      articles: [{ sku: "BOI-001", name: "Café", familyId: "fam-boissons" }],
      families: [{ id: "fam-boissons", name: "Boissons" }],
    });
  }
}

class Sites extends SuggestionSiteChoicesReader {
  openSites(): Promise<readonly StaffSuggestionSiteChoice[]> {
    return Promise.resolve([{ id: "site-centre", label: "Centre" }]);
  }
}

describe("ListStaffSuggestionChoicesHandler", () => {
  it("joint au catalogue servi les points de retrait ouverts (RS8)", async () => {
    const view = await new ListStaffSuggestionChoicesHandler(
      new Catalogue(),
      new Sites(),
    ).execute();

    expect(view.sites).toEqual([{ id: "site-centre", label: "Centre" }]);
    expect(view.families).toEqual([{ id: "fam-boissons", name: "Boissons" }]);
  });
});
