import { writeFileSync } from 'node:fs';
import { reportMarkdown } from '../src/topologies/data/jodhpur';

/** Writes docs/jodhpur-check-report.md — run with: npm run report:jodhpur */
writeFileSync('docs/jodhpur-check-report.md', `${reportMarkdown()}\n`);
console.log('Wrote docs/jodhpur-check-report.md');
