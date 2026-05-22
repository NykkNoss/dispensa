# La mia Dispensa

App Next.js con Firebase per una dispensa condivisa in tempo reale.

## Configurazione

1. Crea un progetto su Firebase.
2. Abilita Authentication con provider Google.
3. Crea un database Firestore.
4. Copia `.env.local.example` in `.env.local` e inserisci i valori della tua web app Firebase.
5. Avvia il progetto con `npm install` e poi `npm run dev`.

## Regole Firestore

Il file `firestore.rules` contiene una base sicura: possono leggere e scrivere solo gli UID Google che inserisci nella lista.

Per trovare gli UID:

1. avvia l'app;
2. accedi con Google;
3. se Firestore blocca l'accesso, la pagina mostra il tuo UID;
4. inserisci il tuo UID e quello della tua compagna in `firestore.rules`;
5. pubblica le regole da Firebase Console.

## Percorso dati

I prodotti vengono salvati in:

```text
pantries/{NEXT_PUBLIC_PANTRY_ID}/products
```

Di default `NEXT_PUBLIC_PANTRY_ID` è `casa`.
