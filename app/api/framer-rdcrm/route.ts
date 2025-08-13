// app/api/framer-rdcrm/route.ts
const RD_BASE = 'https://crm.rdstation.com/api/v1';

async function rdFetch(path: string, method: string, body?: any) {
  const res = await fetch(`${RD_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token token=${process.env.RD_CRM_TOKEN || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    // Importante: usar runtime Node (padrão) para permitir fetch externo com env
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

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const name = String(payload.name || payload.fullname || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const product = payload.product ? String(payload.product).trim() : '';

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: name e email' }), { status: 400 });
    }

    // 1) Criar/atualizar contato no RD CRM
    const contactBody = {
      name,
      emails: [email],
      cf_origin: 'Site Húngara - Framer',
      cf_product: product || null, // crie o campo personalizado no CRM
    };

    const contact = await rdFetch('/contacts', 'POST', contactBody);

    // 2) (Opcional) Criar negociação automaticamente se tiver variáveis definidas
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

    return new Response(JSON.stringify({ ok: true, contact_id: contact?.id || null }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Erro inesperado' }), { status: 500 });
  }
}
