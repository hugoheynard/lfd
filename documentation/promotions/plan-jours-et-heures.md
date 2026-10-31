# Plan — une promotion récurrente : jours et heures

> 📝 **Étude du 2026-10-31**, doc-first. Touche l'**argent** (quand une remise
> s'applique) : `vitruve` avant le bâti. Rien n'est bâti. Les questions du § 6
> attendent Hugo.

## 1. La demande (Hugo, 2026-10-31)

Un anti-gaspi façon « Too Good To Go » sur le pain : la remise ne doit valoir
qu'à certaines heures, et revenir d'elle-même. « On doit pouvoir faire de la
récurrence. » Exemples visés :

- « −50 % sur le pain, tous les jours de 17 h à 19 h » ;
- « −10 % le mardi et le jeudi, toute la journée » ;
- « −20 % du lundi au vendredi, de 7 h à 9 h et de 17 h à 19 h ».

## 2. L'existant (ouvert le 2026-10-31)

- `apps/lfd-api/src/b2b/promotions/domain/promotion-condition.ts` : une union
  de conditions, toutes doivent tenir ; une seule bâtie, `min_quantity`. Son
  JSDoc prévoit « jours et heures » comme une variante de plus, « chacune
  sera une variante et son évaluateur, sans toucher aux autres ».
- Une promotion a déjà une **période** (`validFrom`, `validTo` nullable) et une
  **pause** (`suspendedFrom`), jugées par `inForceAt` (`live-promotion.ts`).
  La récurrence s'inscrit DANS la période : hors période, rien ; dans la
  période, seulement aux jours et heures dits.
- L'heure du métier est celle d'**Europe/Paris** : les heures limites de
  commande s'écrivent `HH:MM`, « pendule d'Europe/Paris »
  (`order-cutoffs/domain/general-order-cutoff.ts:6`) ; les créneaux de retrait
  publics portent un `weekday` et une plage `startTime`/`endTime`
  (`pickup-addresses/domain/public-pickup-slot-rule.ts`). Le temps se lit par
  le port `Clock` (`lint:clock-port`), jamais par `new Date()`.

## 3. La forme proposée

Une nouvelle condition, à côté de `min_quantity` :

```ts
type PromotionCondition =
  | { readonly kind: "min_quantity"; readonly value: number }
  | {
      readonly kind: "weekly_hours";
      /** Une ou plusieurs plages, chacune ses jours. */
      /** L'instant jugé — choisi par promotion (Hugo, Q1). */
      readonly moment: "ordered_at" | "handover_at";
      /** Hors des heures, la boutique dit-elle les heures ? (Hugo, Q2). */
      readonly announceOutside: boolean;
      readonly windows: readonly {
        readonly weekdays: readonly Weekday[]; // lundi … dimanche, au moins un
        readonly start: string; // "HH:MM", Europe/Paris
        readonly end: string; // "HH:MM", après start, le même jour
      }[];
    };
```

- **Refus à la pose** (value object) : aucune plage, aucun jour, heure mal
  formée, fin avant ou égale au début, plages qui se chevauchent un même
  jour, doublon de jour. Une plage qui passe minuit (22 h → 2 h) s'écrit en
  deux plages — à confirmer (§ 6).
- **Évaluateur** : `weeklyHoursAdmit(condition, instant)` convertit l'instant
  en jour et heure de Paris (heure d'été comprise), puis cherche une plage.
  Pur, testé aux bascules d'heure (dernier dimanche de mars et d'octobre).
- **Toutes les conditions doivent tenir** : `weekly_hours` + `min_quantity`
  se combinent comme aujourd'hui.

## 4. Ce que ça touche

- **Le prix affiché** (promotion « dans le prix affiché ») : le prix d'un
  article au catalogue change à 17 h et à 19 h. La résolution est déjà datée
  (`resolvePrice` à un instant, `dated-decisions`), mais tout **cache** de
  prix ou de catalogue servi (boutique, matériaux de prix) doit expirer aux
  bornes — sinon la boutique montre le prix de 16 h 59 à 17 h 05. À recenser
  au bâti (`documentation/` « Cache »).
- **Le panier** : la remise s'applique si l'instant jugé est dans une plage
  (question du § 6).
- **L'annonce et l'offre de connexion** : une promotion à heures annonce
  seulement quand elle s'applique maintenant — ou dit ses heures (« −50 % de
  17 h à 19 h ») : à trancher (§ 6). Elle ne doit jamais promettre hors de
  ses heures.
- **La révision d'une commande (L9)** : une commande passée à 17 h 30 avec la
  remise, révisée à 20 h — garde-t-elle la remise ? Aujourd'hui une révision
  recompose ; à trancher (§ 6), c'est le cas le plus sensible.
- **Le recouvrement** : deux promotions non cumulables aux plages disjointes
  (« 7 h-9 h » et « 17 h-19 h ») ne se recouvrent pas ; aux plages qui se
  croisent, si. Le juge du recouvrement apprend les plages.
- **L'écran** : la carte « Quand, et à quelles conditions ? » gagne
  « Seulement certains jours et heures » — jours à cocher et plages, avec le
  résumé en une phrase (« tous les jours de 17 h à 19 h »).
- **Le journal** : la phrase dit les jours et heures.

## 5. Les données

Les conditions vivent déjà dans la promotion (`conditions`) ; la nouvelle
variante s'y range sans nouvelle table si la colonne est en `jsonb`, à
vérifier au bâti (`promotions.prisma`). Aucune promotion existante ne change.

## 6. Réponses de Hugo (2026-10-31)

1. **L'instant** : **réglé dans la promotion** — « à la commande »
   (`ordered_at`, l'instant de passation) ou « au retrait / à la livraison »
   (`handover_at`, le début du créneau choisi). Sans créneau choisi, une
   promotion `handover_at` ne s'applique pas (rien n'est promis sur un
   instant inconnu).
2. **L'annonce hors des heures** : **réglée dans la promotion** — dire les
   heures (« −50 % sur le pain, de 17 h à 19 h ») ou ne rien dire ; jamais
   présentée comme active hors de ses heures.
3. **La révision** : la commande **garde** la remise acquise à la passation ;
   une modification ne la retire pas pour une question d'heure. (Pour
   `handover_at`, changer de créneau hors des heures, lui, la retire : c'est
   l'acheminement qui change, déjà jugé en L9 — à confirmer par vitruve.)

Restent ouvertes :

4. **Passer minuit** : utile (soirée), ou deux plages suffisent ?
5. **Jours fériés et fermetures** : à ignorer pour l'instant ?

### Les questions telles que posées

1. **Quel instant compte ?** Celui où le client **commande**, ou celui où il
   **retire / est livré** (le créneau choisi) ? Pour un anti-gaspi, on vise
   d'ordinaire « commander entre 17 h et 19 h, retrait le jour même ».
2. **L'annonce hors des heures** : ne rien dire, ou dire les heures
   (« −50 % sur le pain, de 17 h à 19 h ») ?
3. **La révision** : une commande passée dans la plage et modifiée après
   garde-t-elle la remise ?
4. **Passer minuit** : utile (soirée), ou deux plages suffisent ?
5. **Jours fériés et fermetures** : à ignorer pour l'instant ?

## 7. Hors champ

- Le **stock limité** (« les 10 dernières baguettes ») : une autre condition,
  la limite d'usage, prévue et non bâtie.
- L'anti-gaspi **au comptoir** : rien ne s'encaisse en boutique par notre
  système ; seules les commandes en ligne sont concernées.
