import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  CATEGORY_ID,
  OneCategory,
  family,
} from "../../../product/application/__tests__/audience-doubles.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import { CategoryFrozenError, CategoryNotFoundError } from "../../domain/errors/category-errors.js";
import {
  SetCategoryAudienceCommand,
  SetCategoryAudienceHandler,
} from "../set-category-audience.js";

/** L'audience d'une famille (1c du plan d'audience). */
function setting(
  categories: OneCategory,
  journal: RecordingJournal,
  audience: Audience,
  id = CATEGORY_ID,
): Promise<void> {
  return new SetCategoryAudienceHandler(categories, journal, new DirectUnitOfWork()).execute(
    new SetCategoryAudienceCommand(id, audience),
  );
}

describe("SetCategoryAudienceHandler", () => {
  it("ouvre la famille au public seul et le dit au journal", async () => {
    const categories = new OneCategory(family("both"));
    const journal = new RecordingJournal();

    await setting(categories, journal, "public");

    expect(categories.stored?.audience).toBe("public");
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product_category.audience_changed",
        subjectType: "product_category",
        subjectId: CATEGORY_ID,
        payload: { subjectLabel: "Pâtisserie", audience: { from: "both", to: "public" } },
      }),
    ]);
  });

  it("reste muet quand rien ne change", async () => {
    const journal = new RecordingJournal();

    await setting(new OneCategory(family("both")), journal, "both");

    expect(journal.types()).toEqual([]);
  });

  it("refuse une famille archivée, comme ses autres réglages", async () => {
    const categories = new OneCategory(family("both", true));
    const journal = new RecordingJournal();

    await expect(setting(categories, journal, "pro")).rejects.toBeInstanceOf(CategoryFrozenError);
    expect(categories.stored?.audience).toBe("both");
    expect(journal.types()).toEqual([]);
  });

  it("refuse une famille inconnue", async () => {
    await expect(
      setting(new OneCategory(family("both")), new RecordingJournal(), "pro", "cat_absente"),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});
