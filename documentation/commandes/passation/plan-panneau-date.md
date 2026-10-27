# Plan — le jour se choisit en premier

> 📝 Plan du 2026-10-27, demande de Hugo : « il manque un panneau date en
> première étape, qui serait divisé en 3 parties (aujourd'hui bouton pleine
> largeur si activé en admin) en dessous les 6 jours suivants, en dessous autre
> date avec un calendrier ». Front seul : aucun contrat, aucune migration.

## 1. Ce qui existe (lu le 2026-10-27)

- La nouvelle commande part de `OrderDoors.choose()`
  (`client/shop/order-doors.ts`) : « retrait ou coursier ? »
  (`ServiceModeDialog`), puis la maison (`PublicHousePickerDialog`) et l'heure
  (`SlotPickerDialog`, où le **jour** se choisit en onglets), ou l'adresse
  (`DeliveryAddressDialog`, où le jour de livraison se choisit en liste).
- Les jours commandables viennent du serveur : `GET /fulfillment-days`, lu par
  `ServicePoints` (`pickup-points.store.ts` : `days`, `nextDayFor`, `lastDay`).
  Le front n'invente jamais un jour.
- **« Aujourd'hui » n'a pas de réglage à lui** : c'est la règle générale
  d'heure limite (`packages/contracts/src/order-cutoff.ts`, `daysBefore: 0`),
  réglée au back-office. Quand elle l'autorise et que l'heure limite n'est pas
  passée, le serveur sert aujourd'hui comme premier jour.
- fold-ng n'a pas de sélecteur de date ; il a une famille calendrier
  (`FoldCalendarMonthComponent`, helpers `foldToday`, `foldAddDays`).

## 2. Le panneau

Un dialogue **`DayPickerDialog`** (dialogue centré au bureau, feuille du bas en
pile — `dialogSide()`), ouvert **en premier** par `OrderDoors.choose()`, avant
« retrait ou coursier ? ». Trois parties, de haut en bas :

1. **Aujourd'hui** — un bouton pleine largeur, présent seulement si aujourd'hui
   est un jour servi (le serveur le dit ; rien d'autre ne décide). Il porte
   l'heure limite : « Aujourd'hui · commandez avant 10 h ».
2. **Les 6 jours suivants** — une grille de six boutons (jour de la semaine,
   date). Un jour non servi (fermé, hors horizon) est **visible et grisé**, pas
   caché : le client comprend pourquoi il ne peut pas le prendre.
3. **Autre date** — un bouton qui déplie un calendrier du mois ; seuls les jours
   servis sont cliquables. Si le calendrier de fold ne permet pas de
   sélectionner un jour, un `input type="date"` borné (`min`/`max` = premier et
   dernier jour servis) le remplace, et le refus d'un jour non servi se dit
   sous le champ.

Le jour choisi est passé à la suite du parcours :

- **retrait** : `PublicHousePickerDialog` ne propose que les maisons ouvertes
  ce jour-là ; `SlotPickerDialog` s'ouvre **sur** ce jour (ses onglets restent,
  pour changer d'avis) ;
- **coursier** : `DeliveryAddressDialog` reçoit le jour en `currentDate`.

`ServiceChoice.date` reste la journée de production, inchangée.

## 3. Ce qui ne change pas

- « Modifier » dans le panier et la barre garde ses chemins (maison et heure, ou
  adresse et jour) : le panneau n'est que la PREMIÈRE question d'une commande
  neuve.
- Les heures limites et le refus serveur (`orders.cutoff.past`).

## 4. Tests

Specs du dialogue (aujourd'hui présent ou absent selon les jours servis ; six
jours, grisés quand non servis ; autre date bornée) ; `order-doors.spec.ts` :
`choose()` ouvre le panneau d'abord, et fermer le panneau ne pose rien ; le jour
arrive aux dialogues suivants.
