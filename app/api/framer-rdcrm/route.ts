// app/api/framer-rdcrm/route.ts teste
export const dynamic = 'force-dynamic';

const RD_BASE = 'https://crm.rdstation.com/api/v1';
const TOKEN = process.env.RD_CRM_TOKEN;

type AnyObj = Record<string, any>;

function R(data: AnyObj, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function withToken(path: string) {
  const u = new URL(`${RD_BASE}${path}`);
  if (!TOKEN) throw new Error('RD_CRM_TOKEN não configurado');
  u.searchParams.set('token', TOKEN);
  return u.toString();
}

async function rdPost(path: string, body: AnyObj) {
  const res = await fetch(withToken(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* texto puro */ }
  if (!res.ok) {
    throw new Error(`RD ${path} -> ${res.status} ${text}`);
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

    // --- PEGAR PARAMS DA URL ---
    // const { searchParams } = new URL(req.url);
    // const utm_campaign = searchParams.get("utm_campaign")?.trim() || "";

    // 1) Captura do Framer (JSON ou form-data)
    let payload: AnyObj = {};

    try {
      payload = await req.json();
    } catch {
      const fd = await req.formData().catch(() => null);
      if (fd) payload = Object.fromEntries(fd.entries());
    }
    const p: AnyObj = payload?.data || payload;

    // campos padrão do formulário
    const name = String(p.name ?? '').trim();
    const email = String(p.email ?? '').trim().toLowerCase();
    const phone = String(p.phone ?? '').trim();
    const area = String(p.area ?? '').trim();
    const meet = String(p.meet ?? '').trim();
    const product = p.product != null ? String(p.product).trim() : '';
    // let utm_campaign = String(p.utm_campaign ?? '').trim() || 'Orgânico';

    let utm_campaign = String(p.utm_campaign ?? '').trim();
    let utm_source = String(p.utm_source ?? '').trim();
    let utm_medium = String(p.utm_medium ?? '').trim();

    if (!name || !email) {
      return R({ error: 'Campos obrigatórios: name e email', received: p }, 400);
    }

    // 2) ----- CRIAR/ATUALIZAR CONTATO -----
    // estrutura compatível com seu exemplo (emails como objetos e wrapper "contact")
    const cfProductId = process.env.RD_CRM_CF_PRODUCT_ID; // opcional
    const contact: AnyObj = {
      name,
      emails: [{ email }],
      phones: [{ phone }],
      // base legal simples
      legal_bases: [{ category: 'data_processing', status: 'granted', type: 'consent' }],
    };
    if (cfProductId && product) {
      contact.contact_custom_fields = [{ custom_field_id: cfProductId, value: product }];
    }
    // você pode passar organization_id via ENV (opcional)
    if (process.env.RD_CRM_ORG_ID) contact.organization_id = process.env.RD_CRM_ORG_ID;

    const contactRes = await rdPost('/contacts', { contact });

    // 3) ----- CRIAR NEGOCIAÇÃO -----
    // IDs opcionais por ENV
    const dealStageId = process.env.RD_CRM_DEAL_STAGE_ID; // *** RECOMENDADO ***
    const ownerId     = process.env.RD_CRM_OWNER_ID;      // opcional
    const sourceId    = process.env.RD_CRM_DEAL_SOURCE_ID;     // opcional (deal_source._id)

    //Preparar custom fields do deal - IDS da RD
    const areaFieldId = '67cb5e85884fd60021aad369';
    const meetFieldId = '68a3317ccd4b100018b4b220';
    const interesseFieldId = '689f7b214e605b001664425f';
    const campanhaMarketingId = '68a4a014f4ef5d001b0223fa';

    const dealCustomFields: AnyObj[] = [];
    if (areaFieldId && area) {
      dealCustomFields.push({ custom_field_id: areaFieldId, value: area });
    }
    if (meetFieldId && meet) {
      dealCustomFields.push({ custom_field_id: meetFieldId, value: meet });
    }
    if (interesseFieldId && product) {
      dealCustomFields.push({ custom_field_id: interesseFieldId, value: product });
    }
    if (campanhaMarketingId && utm_campaign) {
      dealCustomFields.push({ custom_field_id: campanhaMarketingId, value: utm_campaign });
    }

    // contato mínimo para o array `contacts` do deal
    const dealContact: AnyObj = {
      name,
      emails: [{ email }],
      phones: [{ phone }],
      legal_bases: [{ category: 'data_processing', status: 'granted', type: 'consent' }],
    };

    //nome da negociação
    const dealName = product ? `${name} - ${product} - ${utm_campaign}` : `${name} - ${utm_campaign}`;

    const dealPayload: AnyObj = {
      // ...(campaignId ? { campaign: { _id: campaignId } } : {}),
      // contatos vinculados
      contacts: [dealContact],
      // corpo principal do deal
      deal: {
        name: dealName,
        deal_custom_fields: dealCustomFields,
        // importante: informe o estágio do funil se quiser já cair no lugar certo
        ...(dealStageId ? { deal_stage_id: dealStageId } : {}),
        ...(ownerId ? { user_id: ownerId } : {}),
        rating: 1,
      },
      // origem do negócio (opcional)
      ...(sourceId ? { deal_source: { _id: sourceId } } : {}),
      // produtos do negócio (opcional; aqui mandamos 1 item com o "product" do form)
      ...(product
        ? {
            deal_products: [
              {
                name: product,
                amount: 1,
                base_price: 0,
                price: 0,
                total: 0,
                description: `Produto selecionado no formulário`,
                recurrence: 'spare',
                discount_type: 'value',
              },
            ],
          }
        : {}),
      // organização (opcional)
      ...(process.env.RD_CRM_ORG_ID
        ? { organization: { _id: process.env.RD_CRM_ORG_ID } }
        : {}),
      // distribuição (opcional) – dono específico
      ...(ownerId ? { distribution_settings: { owner: { id: ownerId, type: 'user' } } } : {}),
    };

    const dealRes = await rdPost('/deals', dealPayload);

    return R({
      ok: true,
      contact: contactRes,
      deal: dealRes,
      mode: 'query-token',
    });
  } catch (err: any) {
    console.error('[framer-rdcrm] error:', err?.message || err);
    return R({ error: err?.message || 'Erro inesperado' }, 500);
  }
}
