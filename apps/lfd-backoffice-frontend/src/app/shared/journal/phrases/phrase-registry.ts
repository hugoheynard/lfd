import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Phrase } from '../phrase';

import { ACCOUNTING_PHRASES } from './accounting-phrases';
import { ACCOUNTS_PHRASES } from './accounts-phrases';
import { COMMERCE_PHRASES } from './commerce-phrases';
import { OPERATION_PHRASES } from './operation-phrases';
import { ORDERS_PHRASES } from './orders-phrases';
import { PRICING_PHRASES } from './pricing-phrases';
import { REFERENTIAL_PHRASES } from './referential-phrases';
import { REFERENTIAL_SETTINGS_PHRASES } from './referential-settings-phrases';
import { SETTINGS_PHRASES } from './settings-phrases';
import { STOREFRONT_PHRASES } from './storefront-phrases';
import { TEAM_PHRASES } from './team-phrases';

/**
 * **Le registre des phrases** : une par type du catalogue (D3 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * Un `Record` COMPLET (lot D, 2026-09-19) : un type ajouté au catalogue ne
 * compile pas tant qu'il n'a pas sa phrase — le même mécanisme que
 * `MODULE_LABELS`. Le repli du moteur (`fallback-phrase.ts`) ne sert plus
 * qu'aux types que ce front ne connaît pas : une ligne écrite par une version
 * plus récente de l'API.
 *
 * # Guide de style des phrases (lot D, 2026-09-19)
 *
 * La règle de Hugo : **toute ligne du journal se lit par un humain, sans rien
 * perdre.** La phrase dit l'essentiel ; le détail sous elle rend tout le reste
 * de la charge, automatiquement. Les deux ensemble ne perdent rien — c'est le
 * test de clôture qui le garantit, pas la relecture.
 *
 * ## Où écrire
 *
 * Une phrase va dans le fichier qui tient déjà son PRÉFIXE (`vat_rate.*` dans
 * `referential-phrases.ts`, `pickup_address.*` dans `settings-phrases.ts`) ;
 * sinon dans celui de sa famille au catalogue (`JOURNAL_FACT_FAMILIES`) :
 *
 * | Famille du catalogue  | Phrases                           | Valeurs                          |
 * | --------------------- | --------------------------------- | -------------------------------- |
 * | `referentialCatalogue`| `referential-phrases.ts`          | `values/referential-values.ts`   |
 * | `referentialSettings` | `referential-settings-phrases.ts` | `values/referential-values.ts`   |
 * | `referentialOperations` | `operation-phrases.ts`          | `values/referential-values.ts`   |
 * | `commerce`            | `commerce-phrases.ts`, `storefront-phrases.ts` | `values/commerce-values.ts` |
 * | `accountsAndCarts`    | `accounts-phrases.ts`             | `values/accounts-values.ts`      |
 * | `ordersAndProduction` | `orders-phrases.ts`               | `values/orders-values.ts`        |
 * | `pricing`             | `pricing-phrases.ts`              | `values/pricing-values.ts`       |
 * | `accounting`          | `accounting-phrases.ts`           | `values/accounting-values.ts`    |
 * | `team`                | `team-phrases.ts` (complet)       | `values/team-values.ts`          |
 *
 * Une valeur d'ensemble fermé qui manque
 * s'ajoute au fichier de valeurs de SA famille — le test de clôture dira
 * laquelle.
 *
 * ## Comment la dire
 *
 * 1. **Voix active, passé composé, l'auteur en sujet** : `byActor(fact, [...],
 *    consumed)` — « Colette Martin a renommé la famille « Tartes » ».
 *    `fact.actor` est toujours un sujet valable : le nom figé à l'acte, sinon
 *    la nature de l'auteur (« Un membre de l'équipe », « Le système », « Un
 *    client ») — honnête, jamais un identifiant. La tournure passive
 *    (`said(...)`, la ligne ajoute alors « par … ») est réservée au fait dont
 *    l'auteur de la ligne n'est PAS celui qui a fait le geste : une
 *    recommandation que le système a affichée, un colisage rattrapé par un
 *    rescan (`orders-phrases.ts`). Elle se dit alors sans inventer d'agent.
 * 2. **Le sujet nommé, en gras** : `subject(fact, label)` pour le sujet de la
 *    ligne (lié à sa fiche quand elle existe), avec `subjectLabel` dans
 *    `consumed` — sinon le moteur l'ajoute en fin de phrase (« — Tartes »).
 *    Un objet cité par la charge : `cite({ the: 'la famille', a: 'une
 *    famille' }, payload.parent)` → « la famille « Tartes » », ou « une
 *    famille (identifiant cat_…) » pour une ligne d'avant le lot B (D5 :
 *    jamais un nom résolu aujourd'hui). Une personne : `citePerson(...)`, sans
 *    guillemets. Les guillemets « » entourent un objet, jamais une personne.
 * 3. **Les nombres par les formateurs, jamais à la main** : `inUnit(unit,
 *    raw)` pour un montant, un taux, une date, une durée — l'unité se lit au
 *    catalogue (`cents()`, `millicents()`, `day()`… dans `fact.ts`), jamais au
 *    nom de la clé ; `countOf(n, 'famille', 'familles')` pour un compte. Une
 *    valeur d'ensemble fermé : `valueIn(DOMAINE, raw)`, avec le domaine de
 *    `values/` ; en milieu de phrase, `valueIn(DOMAINE, raw, { inSentence:
 *    true })` (« À emporter » → « à emporter », « SIRET » reste « SIRET ») —
 *    `inSentence(label)` fait de même pour une chaîne.
 * 4. **Ce que la phrase dit, ce qu'elle laisse au détail.** Elle dit QUI a fait
 *    QUOI à QUOI, et le changement quand il tient en une expression
 *    (`fromTo(avant, après)` → « de 5,5 % à 10 % »). Un diff de section ne se
 *    récite pas : `whatChanged(payload.changes)` nomme les champs (« : nom,
 *    description courte », ou « (aucun changement) ») et le détail dit les
 *    valeurs. `consumed` liste EXACTEMENT les clés que la phrase a dites : une
 *    clé déclarée sans être dite disparaît de l'écran, une clé dite sans être
 *    déclarée s'y lit deux fois.
 * 5. **Pas de jargon.** Jamais le type, jamais une clé technique, jamais un
 *    identifiant présenté comme un nom. **Le SKU est accepté** : c'est le mot
 *    du métier, sur les étiquettes et la fiche produit (`KEY_LABELS.sku`) —
 *    mais il accompagne le nom, il ne le remplace pas : « « Tarte citron »
 *    (TAR-001) », sauf là où la charge ne porte rien d'autre (la production
 *    nomme un article par son SKU). Le lexique est celui du dépôt (CLAUDE.md
 *    racine, §8) : **famille** et non catégorie, **déclinaison**,
 *    **retrait**, **remise** pour une réduction de prix SEULEMENT,
 *    **mercuriale**.
 * 6. **Pas de titre**, sauf l'équipe qui en a déjà un (`title: null` partout
 *    ailleurs) : la page n'en affiche pas pour les autres familles.
 * 7. **Une charge ancienne se lit aussi.** Chaque type a sa forme courante et
 *    ses formes d'avant (`journalPayloadShapes`) ; une phrase lit défensivement
 *    (`optional`, `count`, `recordOf` de `payload-read.ts`, ou les helpers
 *    ci-dessus) et un champ absent disparaît de la phrase — jamais `undefined`,
 *    jamais une erreur. Un test par forme.
 *
 * ## Trois exemples, tirés du catalogue
 *
 * **`product_category.vat_changed`** — `{ subjectLabel: "Tartes",
 * vatByContext: { takeaway: { from: { id, name: "Réduit" }, to: { id, name:
 * "Intermédiaire" } } } }` :
 * « Colette Martin a passé le taux à emporter de la famille « Tartes » de
 * « Réduit » à « Intermédiaire » » — `byActor`, `subject`, `valueIn(SALES_CONTEXT,
 * key, { inSentence: true })`, `cite` des deux taux dans `fromTo`. Consomme
 * `subjectLabel` et `vatByContext`. La forme d'avant (un record à la racine,
 * les taux par leur seul id) : « … a changé les taux de TVA d'une famille »,
 * le détail disant « À emporter : (identifiant tva_1) → (identifiant tva_2) ».
 *
 * **`catalog_item.b2b_price_set`** — `{ subjectLabel: "Tarte citron", sku:
 * "TAR-001", before: { priceMillicents: 818182 }, after: { priceMillicents:
 * 900000 } }` :
 * « Colette Martin a fixé le prix professionnel de « Tarte citron » (TAR-001)
 * de 8,18182 € à 9,00 € HT » — `inUnit('millicents', …)` des deux côtés ;
 * `before: null` (premier prix) : « … à 9,00 € HT ». Consomme `subjectLabel`,
 * `sku`, `before`, `after` : le détail n'a plus rien à dire, et c'est juste.
 *
 * **`payment_mandate.revoked`** — `{ subjectLabel: "LFD-2026-0042", company: {
 * id, name: "Café des Halles" }, reference: "LFD-2026-0042", previousStatus:
 * "active", via: "staff" }` :
 * « Colette Martin a révoqué le mandat « LFD-2026-0042 » du client « Café des
 * Halles », qui était actif » — `valueIn(MANDATE_STATUS, …, { inSentence:
 * true })`, le client par `cite({ the: 'du client', a: 'd’un client' }, …)`
 * (« d'un client (identifiant co_…) » sur la forme d'avant, qui ne porte que
 * `companyId`). `via` n'apprend rien que l'auteur
 * ne dise déjà : la phrase le consomme.
 */
export const PHRASES: Readonly<Record<JournalFactType, Phrase>> = {
  ...REFERENTIAL_PHRASES,
  ...REFERENTIAL_SETTINGS_PHRASES,
  ...OPERATION_PHRASES,
  ...SETTINGS_PHRASES,
  ...COMMERCE_PHRASES,
  ...STOREFRONT_PHRASES,
  ...ORDERS_PHRASES,
  ...PRICING_PHRASES,
  ...ACCOUNTS_PHRASES,
  ...ACCOUNTING_PHRASES,
  ...TEAM_PHRASES,
};
