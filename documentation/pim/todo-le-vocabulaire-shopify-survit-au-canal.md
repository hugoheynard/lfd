# TODO — le vocabulaire Shopify a survécu à son canal, jusque dans l'écran du staff

> **Ouvert le 2026-09-22**, en confrontant la documentation du référentiel au
> code après la suppression des documents Shopify.
>
> 🔴 **Ce n'est pas un reste de documentation.** Le canal est sorti du dépôt le
> 2026-09-21 (`a5662c8c4`), ses tables avec (`4e006f97b`, migration
> `20260921220000_retrait_des_tables_shopify`). Mais **deux colonnes du
> contexte de vente lui ont survécu**, et elles sont sur le chemin critique :
> le staff les lit, les modifie, et une garde peut lui refuser une création à
> cause d'elles.
>
> ⚠️ Le back-office est **en service** (CLAUDE.md §0). Ce qui suit est lu par du
> personnel qui n'a pas le code sous les yeux.

---

## 1. Les deux colonnes

Dans `apps/lfd-api/prisma/schema/pim/sales-contexts.prisma` :

| Colonne                                  | Ce que son commentaire dit          |
| ---------------------------------------- | ----------------------------------- |
| `handleSuffix` (`handle_suffix`)         | « Suffixe de handle Shopify »       |
| `shopifyProjected` (`shopify_projected`) | « Shopify en fait-il un produit ? » |

Le fichier qui les porte **avait prévu le coup**. Son propre value object le
dit, et c'est la phrase la plus juste du dossier
(`domain/value-objects/sales-context.ts:30`) :

> ⚠️ Ce champ et `shopifyProjected` sont le vocabulaire d'UNE intégration…

Le référentiel décrit donc un de ses consommateurs — exactement la faute que
`vat-percent.ts` raconte avoir corrigée en sortant le `tag` du taux de TVA. Sauf
qu'ici le consommateur **n'existe plus**.

---

## 2. Ce que ça fait, aujourd'hui, en production

### 🔴 a. Une garde peut REFUSER une création légitime

`application/sales-context-support.ts:45-59` refuse deux contextes projetés qui
partageraient un suffixe, pour ne pas produire deux fois la même URL de produit.

Le message que lit le staff (`domain/errors/sales-context-errors.ts:63-71`) :

> « Un autre contexte projeté porte déjà le suffixe « -surplace ». »

**Il n'y a plus d'URL à protéger.** Cette phrase nomme un cas qui ne peut plus
se produire, et elle bloque un geste réel.

### 🔴 b. L'écran annonce un canal disparu

`apps/lfd-backoffice-frontend/src/app/pim/sales-contexts/sales-contexts-page/sales-contexts-page.ts:85-93`
calcule, pour chaque ligne :

- `'Non projeté vers Shopify'`
- `'Shopify — handle nu'`
- `` `Shopify — handle ${context.handleSuffix}` ``

affichés en badge (`sales-contexts-page.html:56-57`).

### 🔴 c. Le journal écrit « Publié sur Shopify »

`apps/lfd-backoffice-frontend/src/app/shared/journal/key-labels.ts:197` :

```ts
shopifyProjected: 'Publié sur Shopify',
```

Une trace **datée d'aujourd'hui** peut donc dire qu'un réglage « Publié sur
Shopify » a changé. Le journal est ce qu'on relit sous pression.

### ⚠️ d. Et le staff peut encore les modifier

`sales-context-panel.ts:123-187` pose les deux champs en brouillon et les
renvoie au serveur. Un réglage qui **n'a plus aucun effet** est offert comme
s'il en avait un.

---

## 3. Ce que ça coûte de fermer

Ce n'est **pas** une suppression de deux colonnes. Compté le 2026-09-22 :

| Où                    | Ce qui les nomme                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Schéma Prisma         | 2 colonnes                                                                                               |
| Domaine + application | entité, value object, dépôt, registre, 2 handlers, la garde, le contrôleur                               |
| Contrats              | `packages/pim-contracts/src/category.ts`, `packages/contracts/src/journal-facts/referential-settings.ts` |
| Back-office           | page, panneau, libellés de journal                                                                       |
| Semis                 | `prisma/seed-pim/{catalogue,corpus,registry}.ts`                                                         |
| Tests                 | 3 e2e + le harnais + ~8 specs unitaires                                                                  |

🔴 **`packages/` bouge → la règle « la racine dès que `packages` bouge »
s'applique**, et le retrait d'un champ d'un contrat déjà servi se fait en
**trois déploiements** (étendre, basculer, resserrer — CLAUDE.md §0).

---

## 4. La question à trancher AVANT de bâtir, et elle n'est pas technique

**`handleSuffix` porte un besoin qui a survécu à son canal.**

Le TODO du référentiel le dit à l'endroit de C4 : le contexte « sur place » est
**actif et vendu**, et aucun canal n'en fabrique une seconde fiche. Le suffixe
était le mécanisme qui aurait permis à un canal public de distinguer
« croissant » de « croissant sur place » **sans dupliquer le SKU**.

Trois sorties, et c'est à Hugo :

1. **Tout retirer.** Le plus propre aujourd'hui. Le jour où un canal public
   revient, la question se repose entière — mais elle se reposerait de toute
   façon, et pas forcément avec un « handle ».
2. **Renommer sans retirer** — `handleSuffix` → `publicSuffix`, et
   `shopifyProjected` → `publiclyProjected`. Garde le besoin, perd le
   vocabulaire du fournisseur. ⚠️ Renommer une **valeur** est une migration de
   données, pas un renommage (CLAUDE.md §8).
3. **Retirer `shopifyProjected`, garder `handleSuffix`** — le booléen ne dit
   plus rien, le suffixe dit encore quelque chose. Mais la garde d'unicité
   s'appuie sur le booléen : la retirer laisserait deux contextes se donner le
   même suffixe.

⚠️ **Ne rien faire est un choix aussi**, et c'est le moins cher — à une
condition : que l'écran cesse de nommer Shopify. Le point 2.b et le point 2.c
se corrigent **seuls**, sans migration, sans toucher un contrat, en changeant
quatre libellés. C'est la tranche à prendre si on ne prend rien d'autre.
