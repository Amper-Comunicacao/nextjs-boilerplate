// app/api/framer-rdcrm/route.ts
export const dynamic = 'force-dynamic';

const RD_BASE = 'https://crm.rdstation.com/api/v1';

function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function mask(s: string) {
  if (!s) return '(vazio)';
  const a = s.slice(0, 4);
  const b = s.slice(-4);
  return `${a}...${b} (len=${s.length})`;
}

async function rdFetch(path: string, method: string, body?: any) {
  const token = process.env.RD_CRM_TOKEN || '';

  // LOG 1 — token lido da Vercel
  console.log('[RD] token lido?', !!token, 'mask:', mask(token));

  if (!token) throw new Error('RD_CRM_TOKEN não configurado na Vercel');

  const url = `${RD_BASE}${path}`;
  const payload = body ? JSON.stringify(body) : undefined;

  // LOG 2 — chamada que vamos fazer
  console.log('[RD] request ->', method, url, 'body:', body ? body : '(sem body)');

  const r = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token token=${token}`,
    },
    body: payload,
    cache: 'no-store',
  });

  const text = await r.text();

  // LOG 3 — resposta crua do RD
  console.log('[RD] response <-', r.status, text || '(vazio)');

  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* texto puro */ }

  if (!r.ok) {
    throw new Error(`RD CRM ${method} ${path} -> ${r.status} ${text}`);
  }
  return data;
}

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

export async function POST(req: Request) {
  try {
    // Recebe payload (JSON ou form-data)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      const form = await req.formData().catch(() => null);
      if (form) body = Object.fromEntries(form.entries());
    }
    const p = body?.data || body;

    // LOG 0 — o que chegou do Framer
    console.log('[FRAMER] payload recebido:', p);

    const name = String(p.name || '').trim();
    const email = String(p.email || '').trim().toLowerCase();
    const product = p.product != null ? String(p.product).trim() : '';

    if (!name || !email) {
      return json({ error: 'Campos obrigatórios: name e email', received: { name, email, product } }, 400);
    }

    // Cria/atualiza contato
    const contactPayload = {
      name,
      emails: [email],
      cf_origin: 'Site Húngara - Framer',
      cf_product: product || null,
    };
    const contact = await rdFetch('/contacts', 'POST', contactPayload);

    // (Opcional) Criar negócio – mantenha desativado até 200 no /contacts
    if (process.env.RD_CRM_DEAL_STAGE_ID) {
      const dealPayload: any = {
        title: product ? `Interesse: ${product} — Site` : 'Interesse — Site',
        deal_stage_id: process.env.RD_CRM_DEAL_STAGE_ID,
        deal_source_id: process.env.RD_CRM_DEAL_SOURCE_ID || undefined,
        amount: 0,
        contact_emails: [email],
        owner_id: process.env.RD_CRM_OWNER_ID || undefined,
        notes: product ? `Produto selecionado: ${product}` : undefined,
      };
      await rdFetch('/deals', 'POST', dealPayload);
    }

    return json({ ok: true, contact_id: contact?.id || null });
  } catch (err: any) {
    console.error('[API] framer-rdcrm error:', err?.message || err);
    return json({ error: err?.message || 'Erro inesperado' }, 500);
  }
}
