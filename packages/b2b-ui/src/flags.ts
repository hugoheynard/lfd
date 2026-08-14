/**
 * Le service de **livraison** est-il ouvert ?
 *
 * Un seul endroit, parce que cinq écrans en dépendent — la carte Adresses (côté
 * client et côté staff), les préférences d'acheminement, le panier, la
 * checklist d'activation. C'était un réglage staff (`delivery: 'hidden'`) ;
 * c'est en réalité un fait d'entreprise : LFC ne livre pas encore. Le jour où
 * elle livrera, **cette ligne** change et les cinq écrans suivent — pas une
 * chasse au trésor dans deux fronts.
 *
 * Volontairement une constante et non un réglage : ouvrir la livraison demande
 * des zones, des créneaux et des tarifs. Ce n'est pas une case à cocher, c'est
 * une mise en service.
 *
 * ⚠️ Ici et non dans `@lfd/contracts` : les fronts n'importent ce paquet-là
 * qu'en `type`, et une valeur y traînerait **zod** dans leur bundle.
 */
export const DELIVERY_SERVICE_OPEN = false;
