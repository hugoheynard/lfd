import {
  BundleAlreadyDraftError,
  BundleAlreadyWithdrawnError,
  BundleWithdrawnError,
  InvalidBundleTextError,
} from "../errors/bundle-errors.js";
import {
  choicesOf,
  composeGroups,
  type BundleGroupDraft,
} from "../value-objects/bundle-composition.js";
import { keyFrom } from "../value-objects/bundle-key.js";
import {
  BUNDLE_NAME_MAX_LENGTH,
  boundedText,
  optionalDescription,
} from "../value-objects/bundle-text.js";
import {
  bundleAudienceOf,
  bundleStatusOf,
  type BundleRecord,
  type BundleSnapshot,
  type BundleWrite,
  type CreateBundle,
} from "./bundle-shapes.js";

const NAME_FIELD = "Le nom";

/**
 * **Une formule** — des groupes, chacun avec ses articles au choix ; le client
 * en prend un par groupe (`documentation/formules/plan-les-formules.md`, §0,
 * §4.1). Ce lot (F2a) n'en tient que la COMPOSITION : ni prix, ni mise en
 * vente, et elle n'est visible nulle part hors du back-office.
 *
 * L'agrégat porte tout ce qui peut refuser une écriture sans lire le
 * catalogue : la composition (cf. `composeGroups`), les textes, les
 * transitions. Ce qui demande le catalogue — l'article est-il servi au public,
 * réservé à une opération ? (§4.2) — est jugé par le cas d'usage avant
 * `save`, par un port : l'agrégat ne lit rien.
 *
 * Jamais supprimée : on la retire, et on peut la remettre en brouillon.
 */
export class Bundle {
  private constructor(private state: BundleSnapshot) {}

  /**
   * Crée une formule en brouillon. La clé se tire du nom, UNE fois : elle ne
   * suit pas les renommages.
   *
   * @throws {InvalidBundleTextError} nom ou description vide, trop long, ou
   *   un nom dont on ne tire aucune clé.
   * @throws les refus de `composeGroups`.
   */
  static create(input: CreateBundle, write: BundleWrite): Bundle {
    const name = boundedText(input.name, NAME_FIELD, BUNDLE_NAME_MAX_LENGTH);
    const key = keyFrom(name);
    if (key === "") {
      throw new InvalidBundleTextError(NAME_FIELD, BUNDLE_NAME_MAX_LENGTH);
    }
    const drafts = input.groups.map((group) => ({ key: null, ...group }));
    return new Bundle({
      id: input.id,
      key,
      name,
      description: optionalDescription(input.description),
      audience: bundleAudienceOf(input.audience),
      status: "draft",
      groups: composeGroups(drafts, new Set()),
      createdAt: write.at,
      writtenAt: write.at,
      writtenBy: write.by,
    });
  }

  /** Relue de la base : les invariants sont rejugés, une ligne corrompue lève. */
  static reconstitute(record: BundleRecord): Bundle {
    const drafts = record.groups.map((group) => ({ ...group }));
    return new Bundle({
      ...record,
      name: boundedText(record.name, NAME_FIELD, BUNDLE_NAME_MAX_LENGTH),
      description: optionalDescription(record.description),
      audience: bundleAudienceOf(record.audience),
      status: bundleStatusOf(record.status),
      groups: composeGroups(drafts, new Set(record.groups.map((group) => group.key))),
    });
  }

  get key(): string {
    return this.state.key;
  }

  snapshot(): BundleSnapshot {
    return this.state;
  }

  /** Le nom affiché change ; la clé, jamais. */
  rename(name: string, write: BundleWrite): void {
    this.assertEditable();
    this.state = {
      ...this.state,
      name: boundedText(name, NAME_FIELD, BUNDLE_NAME_MAX_LENGTH),
      ...stamp(write),
    };
  }

  /** `null` ou vide efface la description. */
  describe(description: string | null, write: BundleWrite): void {
    this.assertEditable();
    this.state = { ...this.state, description: optionalDescription(description), ...stamp(write) };
  }

  /**
   * **Recompose** la formule : groupes et choix, dans leur ordre, en entier.
   * Ajouter, retirer, renommer ou réordonner un groupe ou un choix sont tous
   * ce geste-là — l'écran envoie l'état voulu, l'agrégat le juge entier.
   */
  recompose(drafts: readonly BundleGroupDraft[], write: BundleWrite): void {
    this.assertEditable();
    const known = new Set(this.state.groups.map((group) => group.key));
    this.state = { ...this.state, groups: composeGroups(drafts, known), ...stamp(write) };
  }

  /**
   * Les articles que cette composition AJOUTERAIT — ceux que le cas d'usage
   * doit faire admettre au catalogue (§4.2). Un article déjà dans la formule
   * n'est pas rejugé : un article masqué depuis ne bloque pas le renommage
   * d'un groupe.
   */
  choicesAddedBy(drafts: readonly BundleGroupDraft[]): readonly string[] {
    const present = new Set(choicesOf(this.state.groups));
    const wanted = drafts.flatMap((draft) => draft.choices.map((sku) => sku.trim()));
    return [...new Set(wanted)].filter((sku) => sku !== "" && !present.has(sku));
  }

  /** @throws {BundleAlreadyWithdrawnError} elle l'est déjà. */
  withdraw(write: BundleWrite): void {
    if (this.state.status === "withdrawn") {
      throw new BundleAlreadyWithdrawnError(this.state.key);
    }
    this.state = { ...this.state, status: "withdrawn", ...stamp(write) };
  }

  /** @throws {BundleAlreadyDraftError} elle l'est déjà. */
  returnToDraft(write: BundleWrite): void {
    if (this.state.status === "draft") {
      throw new BundleAlreadyDraftError(this.state.key);
    }
    this.state = { ...this.state, status: "draft", ...stamp(write) };
  }

  /** @throws {BundleWithdrawnError} une formule retirée ne se modifie plus. */
  private assertEditable(): void {
    if (this.state.status === "withdrawn") {
      throw new BundleWithdrawnError(this.state.key);
    }
  }
}

function stamp(write: BundleWrite): Pick<BundleSnapshot, "writtenAt" | "writtenBy"> {
  return { writtenAt: write.at, writtenBy: write.by };
}
