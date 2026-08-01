'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sincronizar valor externo solo cuando cambie por fuera
  useEffect(() => {
    if (!editorRef.current || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const execCmd = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }, [handleInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const cleanNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const style = el.getAttribute('style') || '';

        let inner = '';
        node.childNodes.forEach(c => { inner += cleanNode(c); });
        if (!inner && tag !== 'br') return '';

        const isBold = tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|700|800|900)/i.test(style);
        const isItalic = tag === 'i' || tag === 'em' || /font-style:\s*italic/i.test(style);
        const isUnderline = tag === 'u' || /text-decoration[^;]*underline/i.test(style);

        if (isBold) inner = `<b>${inner}</b>`;
        if (isItalic) inner = `<i>${inner}</i>`;
        if (isUnderline) inner = `<u>${inner}</u>`;

        if (['h1','h2','h3','h4','h5','h6'].includes(tag)) return `<h3>${inner}</h3>`;
        if (tag === 'li') return `<li>${inner}</li>`;
        if (tag === 'ul') return `<ul>${inner}</ul>`;
        if (tag === 'ol') return `<ol>${inner}</ol>`;
        if (['p', 'div'].includes(tag)) return `<p>${inner}</p>`;
        if (tag === 'br') return '<br>';

        return inner;
      };

      const cleaned = cleanNode(doc.body);
      document.execCommand('insertHTML', false, cleaned);
      handleInput();
    }
  }, [handleInput]);

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>' || value === '<p><br></p>';

  return (
    <div className="space-y-1.5">
      {/* Barra de herramientas */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg border border-border">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }}
          className="px-2.5 py-1 text-xs font-black rounded hover:bg-white transition-colors"
          title="Negrita"
        ><b>B</b></button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }}
          className="px-2.5 py-1 text-xs italic rounded hover:bg-white transition-colors"
          title="Cursiva"
        ><i>I</i></button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }}
          className="px-2.5 py-1 text-xs underline rounded hover:bg-white transition-colors"
          title="Subrayado"
        ><u>U</u></button>
        <div className="h-4 w-px bg-border mx-1" />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }}
          className="px-2.5 py-1 text-xs rounded hover:bg-white transition-colors"
          title="Lista con viñetas"
        >• Lista</button>
      </div>

      {/* Editor WYSIWYG */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          className={cn(
            'min-h-[140px] max-h-[300px] overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background whitespace-pre-wrap leading-relaxed',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            '[&_b]:font-bold [&_strong]:font-bold',
            '[&_i]:italic [&_em]:italic',
            '[&_u]:underline',
            '[&_h3]:text-base [&_h3]:font-bold [&_h3]:my-2',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
            '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
            '[&_li]:my-1',
            '[&_p]:mb-3 [&_p]:leading-relaxed',
            '[&_div]:min-h-[1.25em]',
            className
          )}
          role="textbox"
          aria-multiline="true"
          aria-label="Editor de comunicado"
        />
        {isEmpty && (
          <div className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none select-none">
            {placeholder || 'Escribe o pega el comunicado...'}
          </div>
        )}
      </div>
    </div>
  );
}
