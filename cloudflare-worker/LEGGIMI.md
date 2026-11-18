# Worker Cloudflare del modulo

Il sito sta su GitHub Pages e non ha un server. Il modulo manda i dati a questo Worker.
Il Worker aggiunge il token del CRM e li inoltra al webhook del CRM.
Il token resta nelle impostazioni del Worker: non è mai nella pagina né in questo progetto.

## Come si mette online (una volta sola)

1. Crea un account gratuito su https://dash.cloudflare.com/sign-up.
2. Apri **Workers & Pages** → **Create** → **Create Worker**. Nome: `nello-modulo`. Premi **Deploy**.
3. Premi **Edit code**. Cancella il codice di esempio, incolla tutto `worker.js` e premi **Deploy**.
4. Apri **Settings** → **Variables and Secrets** e aggiungi:
   - `CRM_WEBHOOK_URL`, tipo **Text**: l'indirizzo del webhook dato dal programmatore del CRM.
   - `CRM_WEBHOOK_TOKEN`, tipo **Secret**: il token dato dal programmatore del CRM.
5. Facoltativo, consigliato: **Storage & Databases** → **KV** → crea lo spazio `nello-richieste-fallite`.
   Poi nel Worker: **Settings** → **Bindings** → **Add** → **KV namespace**, nome della variabile `LEADS_FALLITI`.
   Se il CRM non risponde, la richiesta resta lì per 30 giorni e non va persa.
6. Copia l'indirizzo del Worker, per esempio `https://nello-modulo.NOME.workers.dev`.
7. In `index.html` scrivilo nel tag `<meta name="nello-lead-endpoint" content="...">`.

## Cosa fa

- Accetta richieste solo da `https://cipensanello.it` e `https://www.cipensanello.it`
  (per cambiarli: variabile `ALLOWED_ORIGINS`, separati da virgola).
- Tiene solo i campi previsti e scarta il resto.
- Controlla che ci siano nome, ristorante, email valida, telefono con prefisso internazionale e consenso privacy.
- Il campo nascosto `website` lo riempiono solo i programmi automatici: quelle richieste vengono scartate.
- Risponde alla pagina `success: true` con `customer_id` solo se il CRM risponde così. Altrimenti risponde con un errore.
- Nei log scrive solo il motivo dell'errore, mai i dati della persona.
