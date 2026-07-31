'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FormattedContentProps {
  content: string;
  className?: string;
}

/**
 * Convierte sintaxis Markdown simple a HTML seguro si no se proporcionó HTML directo.
 */
function parseSimpleMarkdown(text: string): string {
  if (!text) return '';

  // Si ya contiene etiquetas HTML estructuradas, retornar directo convirtiendo saltos de línea a <br/> si aplica
  if (/<(p|div|b|strong|i|em|u|h[1-6]|ul|ol|li|br)[^>]*>/i.test(text)) {
    return text;
  }

  let html = text
    // Escapar solo < y > sueltos que no sean emoticones ni formato
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Encabezados
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold my-1 text-slate-900">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold my-1.5 text-slate-900">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold my-2 text-slate-900">$1</h1>');

  // Negrita (**texto** o __texto__)
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong class="font-bold text-slate-900">$2</strong>');

  // Cursiva (*texto* o _texto_)
  html = html.replace(/(\*|_)(.*?)\1/g, '<em class="italic">$2</em>');

  // Tachado (~~texto~~)
  html = html.replace(/~~(.*?)~~/g, '<del class="line-through opacity-75">$1</del>');

  // Subrayado (__texto__)
  html = html.replace(/<u>(.*?)<\/u>/gi, '<u class="underline">$1</u>');

  // Listas con guiones/viñetas
  html = html.replace(/^\s*[-•*]\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal">$1</li>');

  // Preservar saltos de línea
  html = html.replace(/\n/g, '<br />');

  return html;
}

export default function FormattedContent({ content, className }: FormattedContentProps) {
  if (!content) return null;

  const htmlContent = parseSimpleMarkdown(content);

  return (
    <div
      className={cn(
        'formatted-content text-sm leading-relaxed break-words whitespace-pre-wrap',
        '[&_b]:font-bold [&_strong]:font-bold [&_b]:text-slate-900 [&_strong]:text-slate-900',
        '[&_i]:italic [&_em]:italic',
        '[&_u]:underline',
        '[&_h1]:text-xl [&_h1]:font-black [&_h1]:my-2 [&_h1]:text-slate-900',
        '[&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:my-1.5 [&_h2]:text-slate-900',
        '[&_h3]:text-base [&_h3]:font-bold [&_h3]:my-1 [&_h3]:text-slate-900',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
        '[&_li]:my-0.5',
        className
      )}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
