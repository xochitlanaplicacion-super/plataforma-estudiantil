import fs from 'node:fs';
import ts from 'typescript';

const files = process.argv.slice(2);
for (const file of files) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => declaration.name.getText(source) === 'supabaseAdmin')) {
      edits.push({ start: statement.getFullStart(), end: statement.getEnd(), text: '' });
    }
    if (ts.isFunctionDeclaration(statement) && statement.body && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
      const bodyText = statement.body.getText(source);
      if (bodyText.includes('supabaseAdmin') && !bodyText.includes('supabase: supabaseAdmin')) {
        edits.push({
          start: statement.body.getStart(source) + 1,
          end: statement.body.getStart(source) + 1,
          text: "\n  const { supabase: supabaseAdmin } = await requireTenantSession();",
        });
      }
    }
  }

  if (!sourceText.includes("from '@/lib/tenant/context'")) {
    const directive = source.statements.find((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression));
    const position = directive ? directive.getEnd() : 0;
    edits.push({ start: position, end: position, text: "\n\nimport { requireTenantSession } from '@/lib/tenant/context';" });
  } else if (!sourceText.includes('requireTenantSession')) {
    throw new Error(`Import context exists without requireTenantSession in ${file}; edit manually.`);
  }

  let output = sourceText;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  fs.writeFileSync(file, output);
}
