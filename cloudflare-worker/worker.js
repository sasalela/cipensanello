// Worker Cloudflare del modulo di cipensanello.it.
// Riceve la richiesta di accesso dalla pagina, controlla i campi, aggiunge il token
// del CRM (che resta qui, mai nella pagina) e la inoltra al webhook del CRM.
//
// Impostazioni del Worker (Settings > Variables and Secrets):
//   CRM_WEBHOOK_URL    indirizzo del webhook del CRM (testo)
//   CRM_WEBHOOK_TOKEN  token del CRM (SEGRETO)
//   ALLOWED_ORIGINS    facoltativo: siti ammessi, separati da virgola
//                      (predefinito: https://cipensanello.it,https://www.cipensanello.it)
// Collegamento facoltativo (Settings > Bindings):
//   LEADS_FALLITI      spazio KV: se il CRM non risponde, la richiesta resta qui 30 giorni

const ORIGINI_PREDEFINITE = 'https://cipensanello.it,https://www.cipensanello.it';

// Campi ammessi e lunghezza massima: tutto il resto viene scartato
const CAMPI = {
  name: 120, email: 200, phone: 20, ristorante: 160, notes: 1000, landing: 200,
  utm_source: 300, utm_medium: 300, utm_campaign: 300, utm_content: 300, utm_term: 300, fbclid: 500,
  privacy_accepted_at: 40, privacy_version: 40,
};

function pulisci(d) {
  if (!d || typeof d !== 'object') return null;
  const out = {};
  for (const [k, max] of Object.entries(CAMPI)) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, max);
  }
  const completo =
    out.name && out.ristorante && out.privacy_version &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email || '') &&
    /^\+\d{8,15}$/.test(out.phone || '') &&
    !Number.isNaN(Date.parse(out.privacy_accepted_at || ''));
  return completo ? out : null;
}

function risposta(corpo, stato, cors) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// Se il CRM non risponde, la richiesta non va persa: resta nello spazio KV (se collegato).
// Nei log va solo il motivo, mai i dati della persona.
async function conserva(env, lead, motivo) {
  console.error('Invio al CRM non riuscito: ' + motivo);
  if (!env.LEADS_FALLITI) return;
  const chiave = 'fallito-' + new Date().toISOString() + '-' + crypto.randomUUID();
  await env.LEADS_FALLITI.put(chiave, JSON.stringify({ motivo, lead }), { expirationTtl: 60 * 60 * 24 * 30 });
}

export default {
  async fetch(request, env) {
    const ammesse = (env.ALLOWED_ORIGINS || ORIGINI_PREDEFINITE).split(',').map((o) => o.trim()).filter(Boolean);
    const origine = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ammesse.includes(origine) ? origine : ammesse[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return risposta({ success: false, error: 'metodo' }, 405, cors);
    if (!ammesse.includes(origine)) return risposta({ success: false, error: 'origine' }, 403, cors);

    let dati;
    try {
      dati = await request.json();
    } catch {
      return risposta({ success: false, error: 'dati' }, 400, cors);
    }

    // Campo trappola: lo compilano solo i programmi automatici. Si scarta senza dirlo.
    if (dati && typeof dati.website === 'string' && dati.website.trim()) {
      return risposta({ success: true, customer_id: 'scartato' }, 200, cors);
    }

    const lead = pulisci(dati);
    if (!lead) return risposta({ success: false, error: 'campi' }, 400, cors);

    if (!env.CRM_WEBHOOK_URL || !env.CRM_WEBHOOK_TOKEN) {
      await conserva(env, lead, 'impostazioni del CRM mancanti');
      return risposta({ success: false, error: 'configurazione' }, 500, cors);
    }

    try {
      const r = await fetch(env.CRM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-token': env.CRM_WEBHOOK_TOKEN },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(10000),
      });
      const esito = await r.json().catch(() => ({}));
      if (r.ok && esito && esito.success === true && esito.customer_id) {
        return risposta({ success: true, customer_id: esito.customer_id }, 200, cors);
      }
      await conserva(env, lead, 'risposta del CRM ' + r.status);
      return risposta({ success: false, error: 'crm' }, 502, cors);
    } catch (e) {
      await conserva(env, lead, 'CRM non raggiungibile');
      return risposta({ success: false, error: 'rete' }, 502, cors);
    }
  },
};
