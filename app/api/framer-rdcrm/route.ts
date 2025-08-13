export const dynamic = 'force-dynamic';

// Aceita POST
export async function POST(req: Request) {
  try {
    let payload: any = {};

    // Tenta receber JSON
    try {
      payload = await req.json();
    } catch {
      // Se não for JSON, tenta form-data
      const form = await req.formData().catch(() => null);
      if (form) {
        payload = Object.fromEntries(form.entries());
      }
    }

    console.log("===== Dados recebidos do Framer =====");
    console.log(JSON.stringify(payload, null, 2));

    // Responde de volta com o que recebeu
    return new Response(
      JSON.stringify({
        ok: true,
        received: payload
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err: any) {
    console.error("Erro no debug:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Erro inesperado" }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
