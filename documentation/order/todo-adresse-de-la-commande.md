# TODO — une commande devrait porter son adresse de contact

> Posé le **2026-09-22**, à la question de Hugo : « comment je fais pour mon
> adresse de confirmation de commande en public […] si ça vient de Google ? en
> fait l'adresse des commandes perso devrait être notée non ? »
>
> 🔴 Touche une **migration de données** → `vitruve` obligatoire quand ceci
> deviendra un plan (CLAUDE.md §9 bis).

---

⚠️ **Le trou d'envoi est déjà relevé**, sous le nom **T14** de
[`audit-flux-de-commande.md`](audit-flux-de-commande.md) (2026-09-17). Ce
document-ci ne le redécouvre pas : il ajoute ce que T14 ne dit pas — que
l'adresse doit être **figée sur la commande**, et pas seulement demandée au
panier.

---

## 1. Ce qui est vrai aujourd'hui (ouvert et vérifié le 2026-09-22)

**La commande ne porte aucune adresse.** Le destinataire se lit **au moment de
l'envoi**, dans l'annuaire :

```ts
// prisma-order-recipient.reader.ts
const row = await this.prisma.user.findUnique({
  where: { id: userId },
  select: { email: true, firstName: true },
});
if (row === null || row.email.trim() === "") {
  return null; // ← et l'envoi n'a pas lieu
}
```

**Deux chemins de courriel en dépendent**, pas un :

| Chemin                                | Ce qui ne part pas                                      |
| ------------------------------------- | ------------------------------------------------------- |
| `order-placed-mail.service.ts`        | la confirmation — **et le QR de retrait qu'elle porte** |
| `send-payment-failed-mail.handler.ts` | l'avis d'échec de paiement                              |

⚠️ **Et l'absence est silencieuse** : `findById` rend `null`, l'appelant
renonce, rien n'est levé ni tracé. Quelqu'un paie et ne reçoit rien pour venir
chercher sa commande — sans que personne l'apprenne.

**La commande invitée ne fait pas mieux.** `prisma-guest-buyer.registrar.ts`
crée une ligne `User` (`auth0Sub: null`, `emailVerified: false`) portant
l'adresse tapée au panier, et la commande pointe vers cette personne. L'adresse
est donc rangée sur la **personne**, jamais sur la commande — même faiblesse.

---

## 2. Pourquoi c'est faux, et ce n'est pas une opinion

**Le dépôt applique déjà le principe inverse, deux fois, sur le même objet.**

- Une `OrderLine` ne pointe pas vers le produit : elle porte le SKU **plus une
  copie** du prix, du nom et de la TVA au moment de la commande.
- `Order.fulfillment` est un instantané, et son commentaire dit exactement
  pourquoi : « le contact d'une adresse, ses heures ou son exigence de
  signature peuvent changer demain, et un bon déjà imprimé ne doit pas se
  mettre à dire autre chose que le papier parti en tournée ».

Une commande est un **fait daté**, pas une vue sur l'état courant. L'adresse de
contact n'a aucune raison d'y échapper :

1. **Changer son adresse réécrit le passé.** Renvoyer une confirmation d'il y a
   trois mois l'enverrait ailleurs que l'original, sans que rien ne le dise.
2. **Rien n'oblige à en avoir une au moment où on en a besoin.** C'est le cas
   qui a fait poser la question : un compte ouvert par Facebook — numéro de
   téléphone, ou partage d'adresse refusé — naît avec une adresse **vide**
   (`CustomerPrincipalResolver.provision` écrit `token.email ?? ""`).

⚠️ **Google marche aujourd'hui par chance**, pas par conception : son jeton
porte l'adresse, donc le provisioning l'écrit chez nous. Rien ne le garantit,
et Facebook ne le fait pas toujours.

---

## 3. La direction

Deux moitiés, et elles se tiennent :

1. **La commande porte son destinataire**, figé à la passation — au même titre
   que ses prix et son acheminement. Les deux chemins de courriel le lisent
   **sur la commande**, plus dans l'annuaire.
2. **On demande l'adresse au panier quand on ne l'a pas** — « il nous manque
   votre e-mail pour vous envoyer la confirmation et le QR de retrait » — avec
   un refus **côté serveur** à la passation : le front seul ne tient rien, un
   appel direct passerait à côté, et c'est le courriel du client qui manquerait.
   C'est déjà la direction écrite au §12.2 de
   [`../auth-inscription/plan-connexion-sociale.md`](../auth-inscription/plan-connexion-sociale.md).

🔴 **Cette adresse est une adresse de CONTACT, pas de connexion.** Elle n'est
pas prouvée : elle ne rattache rien, ne vérifie rien, et ne doit **pas** être
propagée au fournisseur d'identité comme identifiant.

---

## 4. À trancher avant d'écrire une ligne

- **Où la ranger** : une colonne sur `Order`, ou dans le `Json` de
  `fulfillment` ? Une colonne se lit en SQL et se contraint ; le `Json` évite
  une migration mais rend le champ invisible aux requêtes.
- **Les commandes existantes.** Une colonne neuve est vide pour elles. On
  remplit depuis l'annuaire au déploiement (l'état d'aujourd'hui, donc juste
  aujourd'hui), ou on lit « la commande sinon l'annuaire » le temps que le parc
  se renouvelle ? La seconde voie est additive et réversible (CLAUDE.md §0).
- **Le prénom aussi ?** `OrderRecipient` porte `email` **et** `firstName`. Un
  prénom qui change est moins grave qu'une adresse qui change — mais le figer
  coûte le même geste.
- **L'absence doit-elle rester silencieuse ?** Aujourd'hui l'envoi renonce sans
  trace. Même une fois l'adresse figée, un cas de bord restera : il vaudrait
  mieux qu'il se **voie**.

---

## 5. Ce que ça ne fait pas

Ni vérification d'adresse, ni rattachement, ni changement du mode de connexion.
C'est un **instantané**, rien de plus — et c'est ce qui le rend petit.
