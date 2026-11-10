#!/usr/bin/env node
/** Validate a generated course output without reading or exposing credentials. */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const failures = [];
const required = ['course.json', 'slides.json', 'transcript.json', 'preview.jpg', 'review-report.md', 'course.pdf'];
for (const name of required) if (!existsSync(resolve(root, name))) failures.push(`missing ${name}`);

let course = null;
try { course = JSON.parse(await readFile(resolve(root, 'course.json'), 'utf8')); }
catch { failures.push('course.json is not valid JSON'); }

let versions = 0;
for (const chapter of course?.chapters ?? []) {
  if (!chapter.directory || !Array.isArray(chapter.pages)) { failures.push('chapter entry is incomplete'); continue; }
  for (const page of chapter.pages) {
    versions += 1;
    const image = resolve(root, chapter.directory, page.image ?? '');
    if (!page.versionId || !existsSync(image)) failures.push(`missing image for ${page.versionId ?? 'unknown version'}`);
  }
  for (const file of ['slides.pdf', 'index.md', 'summary.md']) {
    if (!existsSync(resolve(root, chapter.directory, file))) failures.push(`missing ${chapter.directory}/${file}`);
  }
}

// Signed URLs must never leave the capture/cache layer.
for (const name of ['course.json', 'slides.json', 'transcript.json', 'review-report.md']) {
  if (!existsSync(resolve(root, name))) continue;
  const text = await readFile(resolve(root, name), 'utf8');
  if (/[?&](?:token|signature|expires|X-Amz-|auth)=/i.test(text)) failures.push(`possible signed query in ${name}`);
}

const result = { root, chapters: course?.chapters?.length ?? 0, versions, ok: failures.length === 0, failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
