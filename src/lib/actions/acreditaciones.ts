'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Regex para validar CURP mexicano (18 caracteres exactos)
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]{2}$/;

const SYSTEM_PROMPT = `Extrae los datos académicos de esta imagen y devuelve ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto extra).
REGLAS CRÍTICAS:
1. CURP: Siempre tiene exactamente 18 caracteres. Puede estar cortado en 2 renglones (ej: 17 letras arriba y 1 dígito abajo). ÚNELOS sin espacios. Ejemplo: "COAY050419MMSBNMA" + "7" = "COAY050419MMSBNMA7".
2. NOMBRES/APELLIDOS: Usa la etiqueta "Nombre(s) Primer Apellido Segundo Apellido" para separar correctamente. No fragmentes apellidos compuestos. Ej: "YEIMI ELIZABETH COBIS ANDRADE" → nombres:"YEIMI ELIZABETH", primer_apellido:"COBIS", segundo_apellido:"ANDRADE".
3. Si un campo no existe, usa null.
Estructura obligatoria:
{
  "fecha_expedicion": "string (OBLIGATORIO FORMATO LARGO: DD de MES de AAAA. Ej: 20 de febrero de 2026)",
  "nombres": "string",
  "primer_apellido": "string",
  "segundo_apellido": "string",
  "curp": "string de 18 caracteres",
  "nivel": "string",
  "perfil": "string",
  "folio_identificacion": "string",
  "etapas_evaluacion": [{ "area": "string", "fecha": "string", "puntaje": 0 }],
  "puntaje_total": 0,
  "calificacion_numerica": 0,
  "resultado_final": "string"
}`;

// Convierte fechas a formato largo en español (ej. "16/03/2026" -> "16 de marzo de 2026")
function estandarizarFecha(fechaStr: string): string {
  if (!fechaStr) return '';
  const limpia = fechaStr.trim().toLowerCase();
  if (limpia.includes(' de ')) return fechaStr;

  const matchShort = limpia.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchShort) {
    const [_, d, m, a] = matchShort;
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesIdx = parseInt(m, 10) - 1;
    if (mesIdx >= 0 && mesIdx < 12) return `${parseInt(d, 10)} de ${meses[mesIdx]} de ${a}`;
  }

  const matchIso = limpia.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchIso) {
    const [_, a, m, d] = matchIso;
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesIdx = parseInt(m, 10) - 1;
    if (mesIdx >= 0 && mesIdx < 12) return `${parseInt(d, 10)} de ${meses[mesIdx]} de ${a}`;
  }
  
  return fechaStr;
}

// Helper: fetch con timeout
async function fetchConTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function procesarDocumentoOCR(formData: FormData) {
  const file = formData.get('file') as File;
  const expectedStatus = formData.get('expectedStatus') as string;
  const fileName = formData.get('fileName') as string || file?.name || 'Desconocido';

  try {
    if (!file) throw new Error("No se proporcionó ningún archivo");

    // --- VALIDACIÓN DE TIPO: Solo imágenes ---
    const tiposPermitidos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!tiposPermitidos.includes(file.type)) {
      return {
        success: false,
        fileName,
        error: `Tipo de archivo no soportado: "${file.type}". Solo se aceptan imágenes (JPG, PNG, WEBP). Los PDFs deben convertirse a imagen antes de subirse.`
      };
    }

    // Convertir a Base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString('base64');
    const mimeType = file.type;

    let jsonData: any = null;
    let engineUsed = "Desconocido";

    // --- INTENTO 1: OPENROUTER (openrouter/free - timeout 25s) ---
    if (process.env.OPENROUTER_API_KEY) {
      try {
        console.log(`[OCR] ${fileName}: Intentando con OpenRouter (openrouter/free)...`);

        const response = await fetchConTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://plataformazapata.com",
            "X-Title": "Plataforma Zapata"
          },
          body: JSON.stringify({
            model: "openrouter/auto",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: SYSTEM_PROMPT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
              ]
            }]
          })
        }, 25000);

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const result = await response.json();
        let text = result.choices?.[0]?.message?.content?.trim() || '';
        if (text.startsWith('```')) text = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

        jsonData = JSON.parse(text);

        // Limpieza post-proceso
        if (jsonData.curp) jsonData.curp = jsonData.curp.replace(/\s+/g, '').toUpperCase();
        if (jsonData.nombres) jsonData.nombres = jsonData.nombres.trim().toUpperCase();
        if (jsonData.primer_apellido) jsonData.primer_apellido = jsonData.primer_apellido.trim().toUpperCase();
        if (jsonData.segundo_apellido) jsonData.segundo_apellido = jsonData.segundo_apellido.trim().toUpperCase();
        if (jsonData.fecha_expedicion) jsonData.fecha_expedicion = estandarizarFecha(jsonData.fecha_expedicion);

        const modelUsed = result.model || "openrouter/auto";
        engineUsed = `IA (${modelUsed.split('/').pop()?.replace(':free', '')})`;
        console.log(`[OCR] ${fileName}: Éxito con ${modelUsed}`);

      } catch (e: any) {
        console.warn(`[OCR] ${fileName}: Fallo OpenRouter →`, e?.message || e);
      }
    }

    // --- INTENTO 2: NVIDIA NIM (Si OpenRouter falla) ---
    if (!jsonData && process.env.NVIDIA_API_KEY) {
      try {
        console.log(`[OCR] ${fileName}: Intentando con NVIDIA NIM...`);

        const response = await fetchConTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            model: "meta/llama-3.2-11b-vision-instruct",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: SYSTEM_PROMPT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
              ]
            }],
            max_tokens: 1024
          })
        }, 25000);

        if (!response.ok) throw new Error(`NVIDIA HTTP ${response.status}`);

        const result = await response.json();
        let text = result.choices?.[0]?.message?.content?.trim() || '';
        if (text.startsWith('```')) text = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

        jsonData = JSON.parse(text);
        if (jsonData.curp) jsonData.curp = jsonData.curp.replace(/\s+/g, '').toUpperCase();
        if (jsonData.fecha_expedicion) jsonData.fecha_expedicion = estandarizarFecha(jsonData.fecha_expedicion);

        engineUsed = "NVIDIA NIM";
        console.log(`[OCR] ${fileName}: Éxito con NVIDIA NIM`);

      } catch (e: any) {
        console.warn(`[OCR] ${fileName}: Fallo NVIDIA →`, e?.message || e);
      }
    }

    // --- VALIDACIÓN ESTRICTA: No guardar basura ---
    if (!jsonData) {
      return {
        success: false,
        fileName,
        error: "Todos los servicios de IA fallaron. Sin conexión o fuera de servicio."
      };
    }

    const curpLimpio = (jsonData.curp || '').replace(/\s+/g, '').toUpperCase();
    if (!CURP_REGEX.test(curpLimpio)) {
      return {
        success: false,
        fileName,
        error: `CURP extraído inválido: "${curpLimpio}". Se requieren 18 caracteres con formato oficial. No se guardaron datos.`
      };
    }

    // Validación semántica de Estatus
    const rawResult = (jsonData.resultado_final || '').toLowerCase();
    const isApprovedDoc = /aprobado|acreditado|pas[oó]|satisfactorio/.test(rawResult);
    const isRejectedDoc = /no aprobado|no acreditado|insatisfactorio|reprobado/.test(rawResult);

    let validationWarning: string | null = null;
    if (expectedStatus === 'APROBADO' && isRejectedDoc) {
      validationWarning = `El documento de "${jsonData.nombres}" dice "${jsonData.resultado_final}" pero lo subiste a la zona Aprobados.`;
    } else if (expectedStatus === 'NO_APROBADO' && isApprovedDoc) {
      validationWarning = `El documento de "${jsonData.nombres}" dice "${jsonData.resultado_final}" pero lo subiste a la zona No Aprobados.`;
    }

    // Guardar en Supabase solo si el CURP es válido
    const { error: insertError } = await supabaseAdmin
      .from('acreditaciones_alumnos')
      .upsert({
        curp: curpLimpio,
        estatus: expectedStatus === 'APROBADO' ? 'Aprobado' : 'No Aprobado',
        fecha_expedicion: jsonData.fecha_expedicion,
        nombres: jsonData.nombres,
        primer_apellido: jsonData.primer_apellido,
        segundo_apellido: jsonData.segundo_apellido,
        nivel: jsonData.nivel,
        perfil: jsonData.perfil,
        folio_identificacion: jsonData.folio_identificacion,
        etapas_evaluacion: jsonData.etapas_evaluacion || [],
        puntaje_total: jsonData.puntaje_total,
        calificacion_numerica: jsonData.calificacion_numerica,
        resultado_final: jsonData.resultado_final,
        visto_por_alumno: false
      }, { onConflict: 'curp' });

    if (insertError) throw insertError;

    return {
      success: true,
      fileName,
      warning: validationWarning,
      engine: engineUsed,
      curp: curpLimpio,
      nombre: `${jsonData.nombres} ${jsonData.primer_apellido} ${jsonData.segundo_apellido || ''}`.trim(),
      data: jsonData
    };

  } catch (error: any) {
    console.error(`[OCR] ${fileName}: Error fatal →`, error);
    return { success: false, fileName, error: error.message };
  }
}
