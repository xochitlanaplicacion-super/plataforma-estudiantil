import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus } from '@/utils/aiServiceValidation';
import { NAVAL_BATTLE_AI_MODEL } from '@/lib/ai/naval-battle-generation';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await requireTenantSession(['profesor']);
    const configured = !!(process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY) && await checkAIServiceStatus();
    return Response.json({ configured, model: NAVAL_BATTLE_AI_MODEL }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ configured: false, error: 'Inicia sesión como profesor autorizado.' }, {
      status: error instanceof Error && error.message === 'No autenticado' ? 401 : 403,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
