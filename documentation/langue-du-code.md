# La langue du code — audit et plan de sortie

> La règle existe depuis le début : **la prose en français, le code en anglais**
> (`CLAUDE.md` §8). Ce doc mesure l'écart réel, propose le lexique, et découpe la
> sortie en paliers dont le premier ne coûte rien et le dernier coûte des jours.
>
> Statut : **📐 audit + décisions à prendre.** Écrit le 2026-08-24.

---

## 1. Ce qui gêne vraiment

Ce n'est pas qu'un mot soit français. C'est qu'un **même symbole** parle deux
langues :

```ts
interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}
```

Un type anglais, des membres français. À la lecture, on ne sait plus quelle
langue attendre au champ suivant — et on finit par écrire `emporterTvaId`, qui
n'est ni l'une ni l'autre.

Le front, lui, **reste en français** : ce sont ses libellés, ils s'adressent à
des humains qui parlent français. Aucune couche de traduction n'est demandée ici.

## 2. L'écart, chiffré (2026-08-24)

| Où                                   | Occurrences                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `src` (identifiants)         | `emplacement` 255 · `tva` 246 · `palier` 147 · `tarif` 130 · `mercuriale` 104 · `remise` 103                                                                           |
| Contrats partagés (`packages/*/src`) | `livraison` 106 · `retrait` 82 · `remise` 57 · `palier` 47 · `gabarit` 38                                                                                              |
| Base : tables / colonnes             | `emplacement`, `emplacement_table`, `tva_rate`, `tva_intracom`, `emplacement_id`, `stacks_over_mercuriale`                                                             |
| Base : **valeurs**                   | `AddressKind { facturation, livraison }` · clés `emporter`/`surPlace` **dans le `jsonb`** `channel_preset` · `sales_context.key` · `"mercuriale"` comme genre de règle |
| ~100 types mixtes                    | `TvaRate*`, `Emplacement*`, `Mercuriale*`, `BoutiqueChannels`, `ContextTva`, `CategoryTvaDraft`…                                                                       |

La dernière ligne du tableau est la seule qui fasse mal : ces valeurs sont **des
données**, pas des noms. Les changer, c'est une migration par champ.

## 3. Le lexique

| Français        | Anglais          | Remarque                                                           |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| emplacement     | `location`       | « site » est ambigu avec le site web                               |
| taux de TVA     | `vatRate`        | `TVA` → `VAT` partout, y compris `tvaIntracom` → `vatNumber`       |
| tarif           | `pricing`        | l'acte de tarifer ; `price` reste le montant                       |
| palier          | `tier`           | terme standard des grilles de prix                                 |
| remise          | `discount`       | —                                                                  |
| retrait         | `pickup`         | déjà utilisé par `FulfillmentMethod.pickup` — l'enum est en avance |
| livraison       | `delivery`       | idem                                                               |
| gabarit         | `template`       | —                                                                  |
| conditionnement | `packaging`      | la table s'appelle déjà `product_packaging`                        |
| boutique        | `shop`           | `boutiques` (la carte) → `shops`                                   |
| à emporter      | `takeaway`       | valeur de donnée — palier 3                                        |
| sur place       | `eatIn`          | valeur de donnée — palier 3                                        |
| **mercuriale**  | **`mercuriale`** | **on le garde** — voir ci-dessous                                  |

### Pourquoi `mercuriale` reste

C'est un mot du métier français sans équivalent anglais juste : ce n'est ni un
`priceList`, ni un `catalog`, ni un `quote`. Le traduire par approximation ferait
perdre ce que le mot dit — et le DDD demande de garder la langue du métier quand
elle est précise. C'est **l'exception nommée**, pas un oubli : une exception
écrite ne dérive pas, une exception tacite si.

## 4. Les paliers

| Palier                                                                                                                                                                             | Coût   | Risque                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| ~~**P1 — arrêter la dérive**~~ ✅ 2026-08-24 : lexique dans `CLAUDE.md`, gate `lint:code-language` en CI                                                                           | fait   | —                                                |
| ~~**P2 — l'intérieur**~~ ✅ 2026-08-24 : `TvaRate`→`VatRate`, `Emplacement`→`Location`, `BoutiqueChannels`→`ShopChannels`. **2076 → 271** identifiants comptés, 4 dossiers drainés | fait   | —                                                |
| **P3 — le fil** : champs des contrats partagés (`livraison`, `retrait`, `remise`…)                                                                                                 | ~1 j   | moyen — back + 3 fronts doivent partir ensemble  |
| **P4 — la base** : tables, colonnes, **et valeurs** (`AddressKind`, clés `jsonb`)                                                                                                  | ~2–3 j | élevé — étendre / basculer / resserrer par champ |

**P1 et P2 sont faits** (2026-08-24), sans rien casser en production. P3 se fait en une fois si les quatre
paquets partent ensemble. P4 est la seule qui demande la discipline de C0 : trois
déploiements par champ, et les clés `emporter`/`surPlace` vivent **dans du
`jsonb`**, donc leur migration réécrit des documents, pas des colonnes.

## 4 bis. Ce que P2 a appris

Trois erreurs, toutes de la même famille : **un remplacement de chaîne ne sait
pas distinguer un nom d'une adresse**.

1. Des dossiers de **migrations** renommés. Prisma les suit par leur nom : une
   migration renommée est une migration inconnue, et elle se rejouerait.
2. `TVA_HANDLE_PREFIX = "tva-"` réécrit en `"vat-"`. C'est ce préfixe qui
   rattache une collection Shopify existante à son taux : le changer les aurait
   toutes orphelinées, sans erreur visible avant la poussée suivante.
3. `remplacement` contient `emplacement` : la prose s'est retrouvée pleine de
   « rlocation ».

Et deux **chemins d'API** ont bougé sans qu'on le décide (`commerce/tva-rates`,
`locations/emplacements`). Rétablis : le front et le back ne se déploient pas au
même instant, donc un chemin qui change sans coordination est une fenêtre de 404.

La leçon opératoire : renommer par lots courts, **relire le diff des chaînes**
(`@map`, URL, valeurs), et faire tourner les trois suites entre chaque lot.

## 4 ter. Ce qui reste de P2

- Les **adresses de livraison** du front client (`AdresseLivraison`,
  `adressesLivraison`) : à confronter d'abord à `@lfd/contracts` — si le champ
  voyage, c'est P3.
- `tvaByContext` (79) et `tvaIntracom` (118) : du fil, donc P3 par construction.

## 5. Ce qu'on ne fera pas

- **Traduire le front.** Ses libellés parlent à des humains francophones. Une
  couche de traduction pour une app mono-langue ajoute un indirection et ne
  supprime aucun bug.
- **Renommer les URL.** `/pim/produits`, `/reglages` : elles sont dans des
  favoris. Le gain est cosmétique, le coût tombe sur celui qui a fait le favori.
- **Traduire `mercuriale`.** Cf. §3.

## 6. Ordre proposé

1. **P1** maintenant — le lexique ci-dessus dans `CLAUDE.md`, plus le gate.
2. **P2** ensuite, en une passe par contexte (catalogue, commerce, orders…).
3. **P3** quand P2 est fini : le fil ne bouge qu'une fois.
4. **P4** en dernier, ou jamais : c'est le seul palier dont le bénéfice est
   purement interne alors que le risque porte sur des données de production.
