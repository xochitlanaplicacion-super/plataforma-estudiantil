import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturePath = resolve(process.cwd(), 'tests/fixtures/academic-grading-step7-golden.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));

process.stdout.write(`
create temporary table step7_golden_cases (
  name text primary key,
  dataset jsonb not null,
  expected_exact text not null,
  expected_display text not null,
  expected_complete boolean not null,
  expected_contributions jsonb not null
);
`);
for (const fixture of fixtures) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  process.stdout.write(`insert into step7_golden_cases values (${quote(fixture.name)}, ${quote(JSON.stringify(fixture.input))}::jsonb, ${quote(fixture.expected.exactGrade)}, ${quote(fixture.expected.displayGrade)}, ${fixture.expected.complete}, ${quote(JSON.stringify(fixture.expected.contributions))}::jsonb);\n`);
}
