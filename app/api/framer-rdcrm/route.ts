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

async function rdFetch(path: string, method: string, body?: any) {
  const token = process.env.RD_CRM_TOKEN || '';
  if (!token) throw new Error('RD_CRM_TOKEN não configurado na Vercell');

  const r = await fetch(`${RD_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token token=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* texto puro */ }

  if (!r.ok) {
    // reenvia erro legível para ver nos Runtime Logs
    throw new Error(`RD CRM ${method} ${path} -> ${r.status} ${text}`);
  }
  return data;
}

// Pré‑flight (caso algum cliente faça OPTIONS)
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
    // 1) Receber payload do Framer (JSON ou form-data)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      const form = await req.formData().catch(() => null);
      if (form) body = Object.fromEntries(form.entries());
    }

    // alguns construtores usam envelope {data:{...}}
    const p = body?.data || body;

    const name = String(p.name || '').trim();
    const email = String(p.email || '').trim().toLowerCase();
    const product = p.product != null ? String(p.product).trim() : '';

    if (!name || !email) {
      return json({ error: 'Campos obrigatórios: name e email', received: { name, email, product } }, 400);
    }

    // 2) Criar/atualizar CONTATO no RD CRM
    // OBS: crie no CRM os campos personalizados cf_origin e cf_product (texto curto).
    const contactPayload = {
      name,
      emails: [email],
      cf_origin: 'Site Húngara - Framer',
      cf_product: product || null,
    };

    const contact = await rdFetch('/contacts', 'POST', contactPayload);

    // 3) (Opcional) Criar NEGOCIAÇÃO automaticamente
    if (process.env.RD_CRM_DEAL_STAGE_ID) {
      const dealPayload: any = {
        title: product ? `Interesse: ${product} — Site` : 'Interesse — Site',
        deal_stage_id: process.env.RD_CRM_DEAL_STAGE_ID,
        deal_source_id: process.env.RD_CRM_DEAL_SOURCE_ID || undefined, // “Site – Framer” se tiver
        amount: 0,
        contact_emails: [email],
        owner_id: process.env.RD_CRM_OWNER_ID || undefined,
        notes: product ? `Produto selecionado: ${product}` : undefined,
      };
      await rdFetch('/deals', 'POST', dealPayload);
    }

    return json({ ok: true, contact_id: contact?.id || null });
  } catch (err: any) {
    // Logar pra ver em Runtime Logs
    console.error('framer-rdcrm error:', err?.message || err);
    return json({ error: err?.message || 'Erro inesperado' }, 500);
  }
}
