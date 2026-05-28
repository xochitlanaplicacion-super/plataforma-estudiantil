import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Tarifas para google/gemini-2.5-flash-lite (USD por 1 Millón de tokens)
const MODEL_ID = "google/gemini-2.5-flash-lite";
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

// Metadatos de cada plantilla para personalizar el prompt
const TEMPLATE_META: Record<string, { titleColor: string; contentColor: string; fontFamily: string; bgDescription: string }> = {
  azul: {
    titleColor: '#ffffff',
    contentColor: '#e0e7ff',
    fontFamily: 'Roboto',
    bgDescription: 'fondo azul marino oscuro, estilo académico y serio',
  },
  canva_estrellas_1: {
    titleColor: '#1e293b',
    contentColor: '#334155',
    fontFamily: 'Nunito',
    bgDescription: 'fondo azul cielo claro con burbujas y estrellas decorativas, estilo amigable',
  },
  blue_modern: {
    titleColor: '#1e3a5f',
    contentColor: '#1e40af',
    fontFamily: 'Poppins',
    bgDescription: 'diseño moderno con figuras geométricas azules, estilo corporativo limpio',
  },
  acuarela_multicolor: {
    titleColor: '#1a1a2e',
    contentColor: '#16213e',
    fontFamily: 'Patrick Hand',
    bgDescription: 'manchas de acuarela multicolor pastel, estilo creativo e infantil',
  },
  lluvia_ideas: {
    titleColor: '#1a1a1a',
    contentColor: '#2d2d2d',
    fontFamily: 'Caveat',
    bgDescription: 'papel kraft marrón con ilustraciones doodle en blanco y negro, estilo sketch creativo',
  },
  purple_watercolor: {
    titleColor: '#2d1b69',
    contentColor: '#4c1d95',
    fontFamily: 'Comfortaa',
    bgDescription: 'acuarelas violeta y lavanda con palmeras tropicales al atardecer, estilo artístico',
  },
  purple_business: {
    titleColor: '#1a0533',
    contentColor: '#3b0764',
    fontFamily: 'Inter',
    bgDescription: 'diseño minimalista morado y blanco con tipografía moderna, estilo profesional',
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tema, numSlides, instrucciones, estilo, userId } = body;

    if (!tema || !numSlides) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (tema, numSlides)." },
        { status: 400 }
      );
    }

    const templateInfo = TEMPLATE_META[estilo] || TEMPLATE_META['canva_estrellas_1'];
    const maxImages = numSlides < 6 ? 1 : numSlides < 12 ? 2 : 3;

    // Calcular límites de texto según número de diapositivas
    const maxCharsTitle = 60;
    const maxCharsContent = numSlides <= 4 ? 850 : numSlides <= 8 ? 600 : 400;
    const maxBullets = numSlides <= 4 ? 6 : numSlides <= 8 ? 4 : 3;

    const systemPrompt = `Eres un experto en diseño pedagógico y presentaciones educativas.
Crearás exactamente ${numSlides} diapositivas sobre el tema indicado.

CONTEXTO DE LA PLANTILLA VISUAL:
La presentación usa una plantilla con ${templateInfo.bgDescription}.
Fuente recomendada: "${templateInfo.fontFamily}".
Color de título: "${templateInfo.titleColor}" (usa EXACTAMENTE este valor para todos los títulos).
Color de contenido: "${templateInfo.contentColor}" (usa EXACTAMENTE este valor para todo el texto de contenido).
NUNCA uses "#ffffff" ni "#fff" como color de texto, ya que puede perderse en el fondo.

REGLAS DE CANTIDAD DE TEXTO Y CALIDAD (MUY IMPORTANTE):
Con ${numSlides} diapositivas, el contenido se distribuye así:
- Cada título: MÁXIMO ${maxCharsTitle} caracteres.
- Cada bloque de contenido: MÁXIMO ${maxCharsContent} caracteres en TOTAL.
- Máximo ${maxBullets} viñetas o puntos por diapositiva.
- CALIDAD: Los puntos deben ser PROFUNDOS, DETALLADOS y ACADÉMICOS. No uses frases cortas, obvias ni palabras clave aisladas; redacta oraciones completas y explicativas que aporten verdadero valor a un nivel universitario.
- Profundiza en la explicación de cada viñeta para aprovechar el límite de texto.
- Primera diapositiva: introducción al tema. Última diapositiva: conclusión o reflexión profunda.

REGLAS DE IMÁGENES:
- Máximo ${maxImages} imágenes en toda la presentación (tipo "image_placeholder").
- Úsalas solo cuando aporten valor visual claro.

POSICIONES Y TAMAÑOS OBLIGATORIOS (porcentajes, no mover):
- Título: x:5, y:8, width:90, height:15
- Contenido (sin imagen): x:5, y:28, width:90, height:62
- Contenido (con imagen): x:5, y:28, width:48, height:62
- Imagen (si aplica): x:57, y:22, width:38, height:68

ESTRUCTURA JSON REQUERIDA (responde SÓLO el JSON puro, sin bloques markdown):
{
  "slides": [
    {
      "titulo": "...",
      "contenido": {
        "elements": [
          {
            "type": "text",
            "content": "Título breve",
            "x": 5, "y": 8, "width": 90, "height": 15,
            "style": {
              "fontSize": "38px",
              "fontFamily": "${templateInfo.fontFamily}",
              "color": "${templateInfo.titleColor}",
              "fontWeight": "bold"
            }
          },
          {
            "type": "text",
            "content": "• Punto 1\\n• Punto 2\\n• Punto 3",
            "x": 5, "y": 28, "width": 90, "height": 62,
            "style": {
              "fontSize": "20px",
              "fontFamily": "${templateInfo.fontFamily}",
              "color": "${templateInfo.contentColor}",
              "fontWeight": "normal"
            }
          }
        ]
      }
    }
  ]
}

Genera exactamente ${numSlides} diapositivas. El total de "image_placeholder" NO debe superar ${maxImages}.`;

    const userPrompt = `
Tema: ${tema}
Número de diapositivas: ${numSlides}
Instrucciones adicionales del profesor: ${instrucciones || "Ninguna"}
`;

    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key de OpenRouter no configurada." }, { status: 500 });
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://iez.edu.mx",
        "X-Title": "IEZ Platform",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error from OpenRouter:", errorText);
      return NextResponse.json(
        { error: "Error al generar diapositivas con IA." },
        { status: 500 }
      );
    }

    const data = await response.json();
    let resultJsonStr = data.choices[0].message.content;
    
    // Extraer tokens de la respuesta de OpenRouter para facturación
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

    // Calcular costo estimado en dólares
    const promptCost = (promptTokens / 1000000) * COST_PER_M_INPUT;
    const completionCost = (completionTokens / 1000000) * COST_PER_M_OUTPUT;
    const totalCostUsd = promptCost + completionCost;

    // Registrar en Supabase de forma asíncrona silenciosa
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      // No usamos await aquí para no bloquear la respuesta al usuario
      supabaseAdmin.from('ai_token_usage').insert({
        user_id: userId || null,
        tipo_peticion: 'diapositivas',
        clase_tema: tema,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        model_used: MODEL_ID,
        estimated_cost_usd: totalCostUsd
      }).then(({ error }) => {
        if (error) console.error("Error guardando uso de tokens de IA:", error);
      });
    }

    // Limpiar si el modelo devolvió bloques markdown de código
    resultJsonStr = resultJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();

    const parsedJson = JSON.parse(resultJsonStr);

    // Formatear y asignar estilo
    const finalSlides = parsedJson.slides.map((s: any, idx: number) => {
      // Asegurarnos de que cada elemento generado tenga un ID único
      if (s.contenido && Array.isArray(s.contenido.elements)) {
        s.contenido.elements = s.contenido.elements.map((el: any, elIdx: number) => ({
          ...el,
          id: el.id || `ai-${Date.now()}-${idx}-${elIdx}-${Math.random().toString(36).substring(2, 9)}`
        }));
      }

      return {
        ...s,
        estilo: estilo || "canva_estrellas_1",
        contenido: JSON.stringify(s.contenido),
        orden: idx + 1
      };
    });

    return NextResponse.json({ slides: finalSlides });

  } catch (error: any) {
    console.error("Error en generación AI:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
