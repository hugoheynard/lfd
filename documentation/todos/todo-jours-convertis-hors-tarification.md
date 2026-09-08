# Les jours convertis en minuit UTC, hors tarification

**Ouvert le 2026-09-08.** 🟡 Inventaire — **aucun défaut avéré**, deux questions
ouvertes.

> Né d'un effet de bord : `lint:business-day` (chantier 2 de
> [`durcir-le-calcul-des-prix.md`](../pricing/durcir-le-calcul-des-prix.md)) a
> d'abord été lancée sur tout le dépôt. Elle a relevé **19 lignes hors
> tarification**. La porte a ensuite été resserrée sur les fenêtres tarifaires —
> pas pour cacher ces dix-neuf, mais parce qu'elles ne se jugent pas au même
> critère. Ce fichier est ce qui reste de ce passage.

---

## Le critère de tri

**Cet instant est-il comparé à autre chose que des instants écrits de la même
façon ?**

- **Non** → conforme, et le corriger serait le défaut. Une journée de service
  écrite à minuit UTC et relue à minuit UTC est une **clé**. Changer un côté
  sans l'autre casse la correspondance.
- **Oui** → question ouverte. L'écart vaut une à deux heures, et il se paie là
  où on compare.

Un troisième cas existe et ne se discute pas : une colonne **`@db.Date`**. Elle
n'a pas d'heure. Prisma n'y écrit qu'à minuit UTC, et c'est la **seule forme
qu'elle comprenne** — `IsoDate.toUtcDate()` le dit dans son propre JSDoc.

## 1. Structurellement conformes — colonnes `@db.Date`

**Vérifié dans `schema.prisma`.** Ces colonnes n'ont pas d'heure ; la question
du fuseau ne s'y pose pas.

| Colonne                                            | Sites                                                                                                                    | Symétrie                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `Order.requestedDeliveryDate` `@db.Date`           | `prisma-order.repository.ts`, `prisma-order.reader.ts`, `prisma-day-orders.reader.ts`, `prisma-pending-orders.reader.ts` | lecture et écriture par la même convention |
| `SubscriptionOccurrence.occurrenceDate` `@db.Date` | `iso-date.ts` (`toUtcDate` / `fromDate`)                                                                                 | aller-retour explicite, éprouvé            |
| `OrderCutoffWaiver.fulfillmentDate` `@db.Date`     | `prisma-order-cutoff-waiver.gate.ts`, `…repository.ts`                                                                   | même clé des deux côtés                    |

**Rien à faire.** À écrire ici seulement pour que le prochain qui lance la porte
élargie ne les prenne pas pour de la dette.

## 2. Question ouverte — fenêtres d'analyse comparées à des `timestamptz`

**Le fait, vérifié.** `prisma-order-metrics.reader.ts` construit sa borne de
fenêtre à partir d'un jour :

```ts
const start = new Date(`${first}T00:00:00.000Z`);
const orders = await this.prisma.order.findMany({
  where: { createdAt: { gte: start }, … },
});
```

`createdAt` est un **instant**, pas un jour. La borne est donc décalée d'une à
deux heures selon la saison : les commandes passées entre minuit et 01 h (ou
02 h) du **premier jour de la fenêtre** en sortent.

Même construction dans `prisma-acquisition-metrics.reader.ts`,
`prisma-market-volume.reader.ts`, `prisma-sector-revenue.reader.ts`, et dans les
calculs de semaines de `growth-stats.ts`, `market-adoption.ts`,
`temperature-flow.ts`.

**Ce que ça coûte.** Quelques commandes de nuit, sur **un** jour d'une fenêtre
qui en compte des dizaines. Ça déplace un chiffre d'analyse, **jamais un prix**.

**Ce qui n'est pas tranché**, et qui décide de tout : `weekStarts` et `dayKey`
découpent-ils les semaines en jours UTC ou en jours de Paris ? Si c'est UTC,
l'ensemble est **cohérent avec lui-même** et il n'y a rien à corriger — juste à
l'écrire. Si c'est mélangé, il y a un décalage à l'intérieur du même calcul.
**Non vérifié.**

## 3. Le seul sur une colonne à heure — la date d'acceptation d'un mandat

`fiche-client/mandat/mandat-panel/mandat-panel.ts` envoie :

```ts
acceptedAt: new Date(`${this.acceptedAt()}T00:00:00.000Z`).toISOString(),
```

et `acceptedAt` est un `DateTime` **sans** `@db.Date` — donc un instant, pas un
jour. Rien ne force minuit UTC ici : c'est le seul site de la liste où la
convention est un choix plutôt qu'une contrainte.

**Ce que ça coûte.** Un mandat SEPA accepté le 1er janvier est enregistré au
1er janvier 01 h 00 heure de Paris. Le **jour** — le seul fait qui compte
juridiquement — est le bon, et le restera tant que le back-office se lit en
France. Pour un lecteur à l'ouest de UTC, il afficherait la veille.

**Ce qu'on peut faire, par ordre de coût :** ne rien faire et l'écrire ; ou
passer par `businessDayStart`, sachant que les mandats déjà enregistrés
garderaient l'ancienne convention — deux encodages dans la même colonne, ce qui
est pire que l'un ou l'autre. **La seule correction propre est une migration de
données**, pour un décalage d'une heure sur une date qu'on n'affiche qu'au jour.

## 4. Non examiné

`analytics/croissance/sector-grain.ts` (deux lignes) — le grain d'un axe de
graphique. Classé par son emplacement, pas par lecture. À ouvrir si quelqu'un
reprend ce fichier.

## Ce qu'il ne faut pas faire

**Élargir `lint:business-day` à tout le dépôt sans trancher le §2.** La porte
tomberait sur dix-neuf lignes dont douze sont conformes par construction. Une
porte qui crie sur ce qui va bien finit désactivée, et emporte avec elle les
sept cas qui méritaient une question.

**Corriger les `@db.Date`.** Ils ne sont pas décalés : ils n'ont pas d'heure.
