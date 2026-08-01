'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FormattedContentProps {
  content: string;
  className?: string;
}

/**
 * Procesa el contenido para garantizar que tanto HTML como Markdown
 * conserven saltos de renglón, párrafos e interlineado legible.
 */
function processContent(text: string): string {
  if (!text) return '';

  // Detectar si el texto contiene etiquetas HTML
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(text);

  if (hasHtml) {
    return text;
  }

  // Es texto plano — convertir sintaxis Markdown simple a HTML
  let html = text
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Encabezados Markdown
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Negrita (**texto** o __texto__)
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Cursiva (*texto* o _texto_)
  html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Tachado (~~texto~~)
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Viñetas Markdown
  html = html.replace(/^\s*[-•]\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  // Convertir saltos de línea dobles en párrafos y sencillos en <br />
  html = html.replace(/\n{2,}/g, '</p><p class="mb-3">');
  html = html.replace(/\n/g, '<br />');

  return `<p className="mb-3">${html}</p>`;
}

export default function FormattedContent({ content, className }: FormattedContentProps) {
  if (!content) return null;

  const htmlContent = processContent(content);

  return (
    <div
      className={cn(
        'formatted-content text-sm leading-relaxed break-words whitespace-pre-wrap',
        '[&_b]:font-bold [&_strong]:font-bold [&_b]:text-slate-900 [&_strong]:text-slate-900',
        '[&_i]:italic [&_em]:italic',
        '[&_u]:underline',
        '[&_h1]:text-lg [&_h1]:font-black [&_h1]:my-3 [&_h1]:text-slate-900',
        '[&_h2]:text-base [&_h2]:font-extrabold [&_h2]:my-2 [&_h2]:text-slate-900',
        '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-2 [&_h3]:text-slate-900',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
        '[&_li]:my-1 [&_li]:list-disc [&_li]:ml-4',
        '[&_p]:mb-3 [&_p]:leading-relaxed',
        '[&_div]:min-h-[1.25em]',
        className
      )}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
