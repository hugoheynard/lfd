# productSet — trouvailles vérifiées (spike dev store)

> **Ledger** des faits du contrat `productSet` de l'API Admin, **vérifiés en conditions
> réelles** contre la dev store `1kkhae-8q.myshopify.com` (API `2026-07`) par introspection
> + mutations jetables. Sert à : corriger `buildProductSetInput` / le driver, écrire les
> **tests** qui verrouillent ces invariants, et alimenter [`shopify-api-map.md`](shopify-api-map.md).
>
> Statut : **vérifié live** (2026-08-05). Chaque ligne = observée, pas supposée.

---

## Contexte : la doc générée était fausse

Le premier essai (forme déduite d'une doc fetchée) a été **rejeté par Shopify** sur deux
points. L'introspection du **vrai schéma** a tranché. Leçon : pour une mutation d'écriture
versionnée, **introspecter la boutique**, ne pas faire confiance à une forme devinée.

## Trouvailles (contrat `productSet`, API 2026-07)

| # | Fait | Preuve |
| --- | --- | --- |
| F1 | **`ProductSetIdentifiers`** = `{ id, handle, customId }`. L'upsert par handle se fait avec **`identifier: { handle }`** — **pas** `{ key: "gid://…ProductByHandle?…" }` (ce champ n'existe pas). | introspection + `key` rejeté « Field is not defined » |
| F2 | **`optionValues` est requis non-null** (`[VariantOptionValueInput!]!`) sur **chaque** variante, y compris la déclinaison par défaut. | introspection (`NON_NULL LIST NON_NULL`) + « optionValues Expected value to not be null » |
| F3 | `VariantOptionValueInput` = `{ id, name, optionId, optionName, linkedMetafieldValue }`. On utilise **`{ optionName, name }`**. | introspection |
| F4 | **`productOptions` est requis dès qu'on fournit des `optionValues`.** Pour un produit sans option, il faut déclarer l'option par défaut **`Title`** / valeur **`Default Title`**. | « Product options input is required when updating variants » |
| F5 | **Upsert par handle inexistant → CRÉATION** (pas d'erreur « not found »). `identifier:{handle}` fait donc bien create-or-update. | mutation live : produit créé, `userErrors: []` |
| F6 | **`price`** = scalaire `Money`, **décimal texte** (`"6.00"`) accepté. | mutation live : variante à `price: "6.00"` |
| F7 | Coût/throttle : `productSet` ≈ 10-13 points ; bucket 2000, restore 100/s. Large pour un volume boulangerie (push séquentiel). | `extensions.cost` |
| F8 | **Re-push même handle → mise à jour EN PLACE** : **même `product id`** (pas de doublon), **handle inchangé** même si le titre change (car on envoie le handle explicitement), prix mis à jour. C'est la garantie « URL stable ». | re-push : `id` identique `…/15913516892504`, `handle` identique, `price` 6.00 → 7.50, `userErrors: []` |
| F9 | `productDelete(input:{id})` → `deletedProductId`. (Sert au cleanup des e2e d'écriture.) | mutation live |

## La forme correcte (déclinaison par défaut, sans option)

```jsonc
// identifier
{ "handle": "gros-florentin-lait" }
// input
{
  "title": "Gros florentin lait",
  "handle": "gros-florentin-lait",
  "status": "DRAFT",
  "productOptions": [
    { "name": "Title", "position": 1, "values": [{ "name": "Default Title" }] }
  ],
  "variants": [
    {
      "sku": "CHO-001-1",
      "price": "6.00",
      "optionValues": [{ "optionName": "Title", "name": "Default Title" }]
    }
  ]
}
```

Avec vraies options (ex. Poids 250 g / 1 kg) : `productOptions` = une entrée par nom
d'option, `optionValues` = une par variante — forme déjà en place dans le mapper.

## Invariants à verrouiller par des tests

- **I1** — `buildProductSetInput` d'un produit **sans option** émet `productOptions: [Title/Default Title]` **et** chaque variante porte `optionValues: [{Title, Default Title}]`. _(garde F2+F4)_
- **I2** — l'identifier de push est **`{ handle }`**, jamais `{ key }`. _(garde F1)_
- **I3** — prix en **décimal texte** (`2400` → `"24.00"`), omis si non tarifé. _(garde F6)_
- **I4** — avec vraies options : `productOptions` déclare chaque nom, `optionValues` chaque valeur par variante. _(déjà testé)_

## Reste à vérifier live (prochains spikes)

- ✅ **Idempotence** : re-push même handle → met à jour la même fiche (F8).
- **Multi-variantes réelles** (ex. Poids) : create + update d'un produit à 2+ déclinaisons.
- **Collections** : `collectionCreate` + `collectionAddProductsV2` (forme à introspecter de même).
- Ces vérifs deviendront les **e2e live gated** de [`shopify-e2e-strategy.md`](shopify-e2e-strategy.md).
