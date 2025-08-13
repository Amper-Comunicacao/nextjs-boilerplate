export const dynamic = 'force-dynamic';

const RD_BASE = 'https://crm.rdstation.com/api/v1';

async function rdFetch(path: string, method: string, body?: any) {
  const res = await fetch(`${RD_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token token=${process.env.RD_CRM_TOKEN || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* texto simples */ }

  if (!res.ok) {
    throw new Error(`RD CRM ${method} ${path} -> ${res.status} ${text}`);
  }
  return json;
}

// Opcional: responder preflight, caso algum cliente faça OPTIONS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function pick<T=any>(obj:any, keys:string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj && obj[k] != null) out[k] = obj[k];
  return out;
}

export async function POST(req: Request) {
  try {
    let payload: any = {};
    // Tenta JSON
    try { payload = await req.json(); } 
    catch {
      // Se não for JSON, tenta form-data (x-www-form-urlencoded/multipart)
      const form = await req.formData().catch(() => null);
      if (form) {
        payload = Object.fromEntries(form.entries());
      }
    }

    // Alguns construtores mandam envelope: { data: {...} } ou { fields: {...} }
    const base = payload?.data || payload?.fields || payload;

    // Tenta chaves comuns
    const cands = [
      base,
      payload?.body,
      payload?.payload,
    ].find(Boolean) || {};

    // Normaliza campos (aceita name/fullname, etc.)
    const name = String(cands.name || cands.fullname || '').trim();
    const email = String(cands.email || '').trim().toLowerCase();
    const product = (cands.product != null) ? String(cands.product).trim() : '';

    if (!name || !email) {
      return new Response(JSON.stringify({
        error: 'Campos obrigatórios ausentes',
        got: pick(cands, ['name','fullname','email','product'])
      }), { status: 400 });
    }

    // 1) Criar/atualizar contato no RD CRM
    const contactBody = {
      name,
      emails: [email],
      cf_origin: 'Site Húngara - Framer',
      cf_product: product || null, // crie o campo personalizado no CRM
    };
    const contact = await rdFetch('/contacts', 'POST', contactBody);

    // 2) (Opcional) criar negociação
    if (process.env.RD_CRM_DEAL_STAGE_ID) {
      const dealBody: any = {
        title: product ? `Interesse: ${product} — Site` : 'Interesse — Site',
        deal_stage_id: process.env.RD_CRM_DEAL_STAGE_ID,
        deal_source_id: process.env.RD_CRM_DEAL_SOURCE_ID || undefined,
        amount: 0,
        contact_emails: [email],
        owner_id: process.env.RD_CRM_OWNER_ID || undefined,
        notes: product ? `Produto selecionado: ${product}` : undefined,
      };
      await rdFetch('/deals', 'POST', dealBody);
    }

    return new Response(JSON.stringify({ ok: true, contact_id: contact?.id || null }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    // Log no server p/ você ver em Runtime Logs
    console.error('framer-rdcrm error:', err?.message || err);

    return new Response(JSON.stringify({
      error: err?.message || 'Erro inesperado'
    }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
