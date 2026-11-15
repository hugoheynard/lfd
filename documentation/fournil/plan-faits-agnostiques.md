# Plan à suivre — les faits du fournil parlent de la production, pas du colisage

> Noté le 2026-11-15 (Hugo : « on finit les déménagements, et on documente ça
> dans un plan à suivre »). Pas commencé. Porte une migration de données (les
> noms des faits durables et de leurs abonnés) : `vitruve` avant le bâti.
> S'ouvre après le découpage ([`plan-decoupage-du-fournil.md`](plan-decoupage-du-fournil.md)).

## 1. En simple

Le fournil **parle du colisage**. Il tient un registre de ce qu'il « remet au
colisage », publie un fait « remis au colisage » et un fait « retour
demandé », et connaît la notion de « propriétaire du colisage ». Or la règle
du dépôt est que le fournil **publie, sans savoir qui écoute** : ses faits
doivent dire ce que **lui** fait, et c'est au colisage de les interpréter.

| Aujourd'hui (le fournil parle de l'aval)              | Demain (le fournil parle de lui)                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| « remis au colisage » (`HandedToPackingEvent`)        | « une fournée est sortie » (produit, quantité, instant)                                          |
| « retour demandé » (`ReturnRequestedEvent`)           | « une production est reprise »                                                                   |
| registre des remises                                  | ce que le fournil a produit — ou, s'il suit ce que le colisage a reçu, il appartient au colisage |
| `PackingOwner` (`legacy` / `packing`) dans le fournil | à retirer du fournil : c'est un état du colisage                                                 |

La frontière technique est respectée aujourd'hui (le fournil déclare
`production/channels/packing/`, le colisage s'y abonne) ; c'est le
**vocabulaire** qui fuit, et avec lui une connaissance du métier d'à côté.

## 2. Ce qui existe (vérifié le 2026-11-15)

- `apps/lfd-api/src/production/atelier/application/services/packing-handoffs.service.ts` (à l'atelier
  depuis C5 du découpage ; `PackingHandoffs`, ~165 lignes) : registre `ProductionHandoffLedger`,
  lecteur `ProductionHandoffReader`, `ProductionReturnRequests` ; publie
  `HandedToPackingEvent` et `ReturnRequestedEvent`
  (`production/channels/packing/`) par la boîte d'envoi.
- `PackingOwner` (`production/day/domain/value-objects/packing-owner.ts`)
  choisit le chemin dans `cancel-batch.handler.ts` et le service ci-dessus
  (relevé par la revue SOLID du 2026-11-15).
- Les abonnés du colisage à ces faits sont durables, enregistrés par nom.

## 3. À faire, quand on l'ouvrira

1. Inventorier précisément ce que le colisage tire de ces faits et du
   registre (qui lit quoi, pour quel écran).
2. Écrire les faits agnostiques et leur contrat dans le canal ; le colisage
   s'y abonne et interprète.
3. Migrer les noms des faits et des abonnés dans la boîte d'envoi (comme le
   renommage des abonnés `lfc.…`), messages en vol compris.
4. Sortir `PackingOwner` du fournil.
5. Décider du registre : production du fournil, ou réception du colisage.

## 4. Qui émet : la journée (décidé avec Hugo le 2026-11-15)

Les faits sur un changement d'état de la journée sont **émis par l'agrégat**
`ProductionDay` (« une fournée est sortie », « une fournée est annulée »,
« la journée est arrêtée »), recueillis par son dépôt et écrits dans la boîte
d'envoi dans la même transaction que l'état. Aucun service de métier ne les
publie : un geste qui oublierait d'appeler le service laisserait l'aval dans
l'ignorance, alors qu'une mutation de l'agrégat produit toujours son fait.

- Le noyau **déclare** ces faits dans son vocabulaire ; `channels/packing/` les
  réexpose pour l'aval. `day/index.ts` ne charge toujours aucun canal : le
  canal dépend du noyau, pas l'inverse.
- Un métier ne publie que les faits de ce qu'il possède (la qualité ses
  verdicts, le plan l'envoi du dossier). L'atelier, qui ne possède aucun
  état, ne publie plus rien : `PackingHandoffs` disparaît.
- S'ouvre après le lot R du découpage.
