'use server';

import { createClient } from '@supabase/supabase-js';

// Modelo primario: Gemini 3 Flash Preview (pago, ~$0.002/doc, ultra confiable y rápido)
// Fallbacks gratuitos: se usan solo si el modelo primario falla
const FREE_MODELS = [
  "google/gemini-3-flash-preview",          // ★ PRIMARIO: Gemini 3 Flash Preview, el que no falla
  "baidu/qianfan-ocr-fast-20260420:free",   // Fallback 1: gratis, bueno en OCR
  "nvidia/nemotron-nano-12b-v2-vl:free",    // Fallback 2: gratis
  "google/gemini-3.1-flash-lite-preview",   // Fallback 3: Gemini 3.1 Flash Lite (baratísimo)
  "meta-llama/llama-4-scout:free",          // Fallback 4: gratis
  "openrouter/auto"                         // Fallback 5: OpenRouter elige automáticamente
];
let currentModelIndex = 0;

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
3. FECHA DE ETAPAS DE EVALUACIÓN: En la tabla "Etapas de la Evaluación", la columna "Fecha" es una celda combinada verticalmente en el centro de la tabla (ej: "13/02/2026"). Es UNA sola fecha que aplica para TODAS las materias. Escríbela en la propiedad "fecha" de TODAS las materias del arreglo. Usa SIEMPRE formato corto: DD/MM/AAAA (Ej: "13/02/2026"). Si ves la fecha como "13 de febrero de 2026" conviértela a "13/02/2026".
4. Si un campo no existe, usa null.
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
  "etapas_evaluacion": [{ "area": "string", "fecha": "DD/MM/AAAA (formato corto obligatorio)", "puntaje": 0 }],
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

// Convierte cualquier formato de fecha a formato corto DD/MM/AAAA
function fechaACorta(fechaStr: string): string {
  if (!fechaStr) return '';
  const limpia = fechaStr.trim().toLowerCase();

  // Ya está en formato corto DD/MM/AAAA o DD-MM-AAAA
  const matchShort = limpia.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchShort) {
    const d = matchShort[1].padStart(2, '0');
    const m = matchShort[2].padStart(2, '0');
    const a = matchShort[3];
    return `${d}/${m}/${a}`;
  }

  // Formato largo español: "13 de febrero de 2026"
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const matchLargo = limpia.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (matchLargo) {
    const d = matchLargo[1].padStart(2, '0');
    const mesNombre = matchLargo[2];
    const a = matchLargo[3];
    const mesIdx = meses.indexOf(mesNombre);
    if (mesIdx >= 0) return `${d}/${String(mesIdx + 1).padStart(2, '0')}/${a}`;
  }

  // Formato ISO AAAA-MM-DD
  const matchIso = limpia.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchIso) {
    const a = matchIso[1];
    const m = matchIso[2].padStart(2, '0');
    const d = matchIso[3].padStart(2, '0');
    return `${d}/${m}/${a}`;
  }

  return fechaStr; // Si no reconoce el formato, devuelve el original
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

    // --- VALIDACIÓN DE CUOTA MENSUAL (BACKEND, capa de seguridad servidor) ---
    const LIMITE_MENSUAL = 50;
    const ahora = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const { count: docsMes } = await supabaseAdmin
      .from('acreditaciones_alumnos')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', primerDiaMes);

    if ((docsMes ?? 0) >= LIMITE_MENSUAL) {
      console.warn(`[CUOTA] Límite mensual de ${LIMITE_MENSUAL} documentos alcanzado. Procesados este mes: ${docsMes}`);
      return {
        success: false,
        fileName,
        error: 'CUOTA_EXCEDIDA'
      };
    }

    // Convertir a Base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString('base64');
    const mimeType = file.type;

    let jsonData: any = null;
    let engineUsed = "Desconocido";
    let curpLimpio = '';

    if (!process.env.OPENROUTER_API_KEY) {
      return { success: false, fileName, error: "Falta API Key de OpenRouter" };
    }

    let attempts = 1;

    // --- CICLO DE INTENTOS INFINITO (NUNCA SE RINDE) ---
    while (!jsonData) {
      const modelToTry = FREE_MODELS[currentModelIndex];
      console.log(`[OCR] ${fileName}: Intentando con ${modelToTry} (Intento infinito #${attempts})...`);

      try {
        const response = await fetchConTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://plataformazapata.com",
            "X-Title": "Plataforma Zapata"
          },
          body: JSON.stringify({
            model: modelToTry,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: SYSTEM_PROMPT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
              ]
            }]
          })
        }, 30000); // 30s timeout

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 150)}`);
        }

        const result = await response.json();
        let text = result.choices?.[0]?.message?.content?.trim() || '';
        if (text.startsWith('```')) text = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(text);

        // Prueba de fuego: ¿Tiene un CURP válido?
        const curpTest = (parsed.curp || '').replace(/\s+/g, '').toUpperCase();
        if (CURP_REGEX.test(curpTest)) {
          // Éxito total
          jsonData = parsed;
          curpLimpio = curpTest;
          
          // Limpieza post-proceso
          jsonData.curp = curpLimpio;
          if (jsonData.nombres) jsonData.nombres = jsonData.nombres.trim().toUpperCase();
          if (jsonData.primer_apellido) jsonData.primer_apellido = jsonData.primer_apellido.trim().toUpperCase();
          if (jsonData.segundo_apellido) jsonData.segundo_apellido = jsonData.segundo_apellido.trim().toUpperCase();
          if (jsonData.fecha_expedicion) jsonData.fecha_expedicion = estandarizarFecha(jsonData.fecha_expedicion);

          // Nombre visible para el cliente (no revelar el modelo real ni el proveedor)
          engineUsed = "Agente de Reconocimiento Documental IA";
          // Solo para logs internos del servidor:
          console.log(`[OCR] ${fileName}: ÉXITO DEFINITIVO con ${modelToTry}`);
          break; // Romper el ciclo, mantener currentModelIndex en el modelo ganador
        } else {
          console.warn(`[OCR] ${fileName}: ${modelToTry} falló prueba de CURP ("${curpTest}"). Rotando IA...`);
        }
      } catch (e: any) {
        console.warn(`[OCR] ${fileName}: Error con ${modelToTry} → ${e.message}. Rotando IA...`);
      }

      // Si llegamos aquí, falló. Avanzamos al siguiente modelo en el array circular.
      currentModelIndex = (currentModelIndex + 1) % FREE_MODELS.length;
      attempts++;

      // --- ESPERA DE SEGURIDAD (BACKOFF) ---
      // Para evitar que el ciclo infinito dispare 100 peticiones por segundo cuando hay
      // error de Rate Limit (HTTP 429) o modelos caídos, esperamos 3 segundos.
      console.log(`[OCR] Esperando 3 segundos antes del próximo intento para enfriar la API...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Validación semántica de Estatus
    const rawResult = (jsonData.resultado_final || '').toLowerCase();
    const isApprovedDoc = /aprobado|acreditado|pas[oó]|satisfactorio/.test(rawResult);
    const isRejectedDoc = /no aprobado|no acreditado|insatisfactorio|reprobado|no present[oó]/.test(rawResult);

    let validationWarning: string | null = null;
    if (expectedStatus === 'APROBADO' && isRejectedDoc) {
      validationWarning = `El documento de "${jsonData.nombres}" dice "${jsonData.resultado_final}" pero lo subiste a la zona Aprobados.`;
    } else if (expectedStatus === 'NO_APROBADO' && isApprovedDoc) {
      validationWarning = `El documento de "${jsonData.nombres}" dice "${jsonData.resultado_final}" pero lo subiste a la zona No Aprobados.`;
    }

    if (validationWarning) {
      return {
        success: false,
        fileName,
        error: validationWarning, // The mismatch message is shown as error
        engine: engineUsed,
        curp: curpLimpio,
        nombre: `${jsonData.nombres} ${jsonData.primer_apellido || ''} ${jsonData.segundo_apellido || ''}`.trim(),
      };
    }

    // --- POST-PROCESO: Etapas de evaluación ---
    if (Array.isArray(jsonData.etapas_evaluacion) && jsonData.etapas_evaluacion.length > 0) {
      // 1) Encontrar la primera fecha válida en cualquier etapa
      const fechaEtapaRaw = jsonData.etapas_evaluacion.find((e: any) => e.fecha && e.fecha.trim() !== '')?.fecha;
      const fechaEtapaCorta = fechaEtapaRaw ? fechaACorta(fechaEtapaRaw) : '';

      // 2) Propagar y normalizar a formato corto DD/MM/AAAA en todas las etapas
      jsonData.etapas_evaluacion = jsonData.etapas_evaluacion.map((etapa: any) => ({
        ...etapa,
        fecha: etapa.fecha && etapa.fecha.trim() !== ''
          ? fechaACorta(etapa.fecha)
          : fechaEtapaCorta
      }));

      // 3) Si fecha_expedicion está vacía, usarla convertida a formato largo
      if (!jsonData.fecha_expedicion && fechaEtapaCorta) {
        jsonData.fecha_expedicion = estandarizarFecha(fechaEtapaCorta);
      }
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

export async function getHistoricoAcreditaciones() {
  try {
    const { data, error } = await supabaseAdmin
      .from('acreditaciones_alumnos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('[OCR] Error al obtener histórico:', error);
    return { success: false, error: error.message };
  }
}

export async function updateAcreditacion(id: string, updates: any) {
  try {
    const { data, error } = await supabaseAdmin
      .from('acreditaciones_alumnos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('[OCR] Error al actualizar registro:', error);
    return { success: false, error: error.message };
  }
}
