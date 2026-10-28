# Plan — le premier jour commandable, par clientèle

> 📝 Plan du 2026-10-28, doc-first. Demande de Hugo : « à partir de demain je
> vais devoir ouvrir les commandes mais n'autoriser que seulement à partir de
> certaines dates ». Tranché le même jour :
>
> - **une date par clientèle** (pros, particuliers) ;
> - **les exemptions passent outre**, comme pour la fermeture.
>
> Il étend [`ouverture-de-la-boutique.md`](ouverture-de-la-boutique.md) : même
> réglage, même règle d'admission, même écran.

## 1. Ce qui existe (relu le 2026-10-28)

| Maillon             | Aujourd'hui                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Réglage             | `public.order_opening_settings` (modèle `OrderOpening`, `prisma/schema/public/settings.prisma`) : `orders_open_to_b2b`, `orders_open_to_b2c`, l'auteur et l'instant. Page `reglages/commandes/order-opening-page/`.                                                                                                            |
| Règle               | `b2b/order-opening/domain/order-admission.ts` : `admitsOrder` — ouverte à la clientèle, ou une exemption active couvre la société ou l'adresse.                                                                                                                                                                                |
| Passation           | `OrderIntake.admit` (`orders/application/services/order-intake.service.ts`), appelé par `place-order.handler.ts` et `place-shop-order.handler.ts` avant toute composition ; refus `OrdersClosedForAudienceError` (409). La saisie par l'équipe (`place-order-for-customer.handler.ts`) n'y passe pas — décision du 2026-10-09. |
| La journée          | Contrôlée à part : `OrderDrafting.ensureDayOpen` (plan arrêté, jour même) et, pour une commande modifiée, `OrderRevising.ensureDayOpen`.                                                                                                                                                                                       |
| Jours proposés      | `GET /fulfillment-days` (`order-cutoffs/application/list-fulfillment-days.handler.ts`) : premier jour par point de retrait, d'après les heures limites, le jour même, les plans arrêtés et les fenêtres d'opération. Il ne refuse jamais ; la boutique le lit (`shop/pickup-points.store.ts`).                                 |
| Admission à l'écran | `GET /order-opening` (les deux booléens) ; quand c'est fermé, `GET /order-admission/mine` ou `POST /order-admission/guest` rendent `{ canOrder }` pour CETTE personne (`shop/order-admission.store.ts`).                                                                                                                       |
| Journal             | `order_opening.updated` (`packages/contracts/src/journal-facts/orders-production.ts`) : l'état posé et le précédent.                                                                                                                                                                                                           |

## 2. Le modèle

- Deux dates facultatives sur le même réglage : `first_service_day_b2b` et
  `first_service_day_b2c`, type `DATE`, `NULL` = pas de restriction. Ce sont
  des **journées de service** (le jour de retrait ou de livraison), pas des
  instants : elles ne passent jamais par minuit UTC (`lint:business-day`).
- **La règle**, pure, à côté d'`admitsOrder` : une journée de service est
  admise si la clientèle n'a pas de premier jour, si la journée est égale ou
  postérieure à ce jour, **ou si une exemption active couvre qui commande**.
- Une date passée ne restreint plus rien, sans qu'on ait à la vider.
- Les commandes **déjà passées** ne sont pas touchées.
- **La saisie par l'équipe n'y est pas soumise**, comme pour la fermeture :
  l'équipe peut prendre une commande pour avant la date, en connaissance de
  cause.

## 3. Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Où            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| J1  | Serveur. Migration additive (deux colonnes `DATE NULL`). Le réglage les lit et les écrit (commande `UpdateOrderOpening`, vue admin, vue publique). La règle pure `admitsServiceDay`. `OrderIntake` gagne la vérification de la journée, appelée par les deux passations client **et** par la révision côté client (`OrderRevising`, quand la date change). Refus `ServiceDayBeforeFirstOrderableDayError` (409) qui nomme la date : « Les commandes des particuliers sont ouvertes pour le jeudi 30 octobre et les jours suivants. Choisissez cette date ou une suivante. » `order_opening.updated` porte les deux dates et leurs valeurs précédentes. | api, contrats |
| J2  | Admission par personne : `{ canOrder }` devient `{ canOrder, firstServiceDay }` — la date qui s'applique à CETTE personne (`null` si elle n'en a pas, ou si une exemption la couvre). La boutique la demande aussi quand une date est posée, pas seulement quand c'est fermé.                                                                                                                                                                                                                                                                                                                                                                          | api, contrats |
| J3  | Back-office : sur la page Ouverture des commandes, un champ date par clientèle, sous sa case, avec « Aucune » pour vider. Le journal le dit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | back-office   |
| J4  | Boutique : le choix du jour ne propose rien avant la date de la personne (le plus tard entre le premier jour servi par `/fulfillment-days` et la date). Une ligne dit « Commandes à partir du jeudi 30 octobre ». Les textes passent par le dictionnaire (`pnpm copy:digest`).                                                                                                                                                                                                                                                                                                                                                                         | boutique      |

`/fulfillment-days` n'est **pas** touché : il dit ce que la production permet,
pas ce que la clientèle a le droit de demander. C'est l'écran qui combine les
deux, et la passation qui fait foi.

## 4. Les cas à tenir

- **Commande sans compte et exemption par adresse** : avant la saisie de
  l'adresse, la boutique applique la date de la clientèle ; quand l'adresse est
  saisie, `POST /order-admission/guest` rend `firstServiceDay: null` si elle est
  exemptée, et le calendrier s'ouvre.
- **Une date posée APRÈS qu'un panier a choisi un jour plus tôt** : la passation
  refuse avec la date ; la boutique relit l'admission et propose la date.
- **Boutique fermée ET date posée** : la fermeture l'emporte (on ne commande
  pas) ; la date ne joue qu'une fois rouvert.
- **Livraison et retrait** : même règle, c'est la journée de service qui compte.

## 5. Tests

Domaine (la règle : avant, le jour même, après, sans date, date passée,
exemption), application (passation et révision refusées et admises, l'équipe
non bloquée), e2e (réglage → refus 409 → admission par personne → exemption).
