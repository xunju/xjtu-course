import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterSlideVersions, pixelSimilarity, textSimilarity } from '../src/course/slide-versions.js';

const s = (...values) => Uint8Array.from(values);

test('similarity helpers handle identical and changed evidence', () => {
  assert.equal(pixelSimilarity(s(0, 10), s(0, 10)), 1);
  assert.ok(pixelSimilarity(s(0, 10), s(0, 20)) > 0.9);
  assert.equal(textSimilarity('第一章 线性表', '第一章 线性表'), 1);
  assert.ok(textSimilarity('第一章 线性表', '第二章 栈') < 0.5);
});

test('keeps progressive versions and merges a later revisit', () => {
  const slides = clusterSlideVersions([
    { time: 0, image: 'v1-a', sample: s(10, 10, 10), sharpness: 1, ocrText: '第1章 线性表' },
    { time: 10, image: 'v2', sample: s(10, 10, 30), sharpness: 1, ocrText: '第1章 线性表\n定义' },
    { time: 20, image: 'v2-revisit', sample: s(10, 10, 30), sharpness: 2, ocrText: '第1章 线性表\n定义' },
    { time: 30, image: 'v1-revisit', sample: s(10, 10, 10), sharpness: 2, ocrText: '第1章 线性表' },
  ], { versionVisual: 0.985, versionText: 0.8, slideVisual: 0.82, slideText: 0.65 });
  assert.equal(slides.length, 1);
  assert.equal(slides[0].versions.length, 2);
  assert.deepEqual(slides[0].versions[0].occurrences, [0, 30]);
  assert.deepEqual(slides[0].versions[1].occurrences, [10, 20]);
  assert.equal(slides[0].versions[1].image, 'v2-revisit');
});

test('default course thresholds retain subtle visual changes as versions', () => {
  const slides = clusterSlideVersions([
    { time: 0, sample: s(100, 100, 100, 100), ocrText: '同一页 标题' },
    { time: 1, sample: s(100, 100, 101, 101), ocrText: '同一页 标题' },
  ]);
  assert.equal(slides.length, 2);
  assert.equal(slides.flatMap((slide) => slide.versions).length, 2);
});

test('creates a new logical page for unrelated content', () => {
  const slides = clusterSlideVersions([
    { time: 0, sample: s(0, 0, 0), ocrText: '绪论 课程目标' },
    { time: 4, sample: s(255, 255, 255), ocrText: '第二章 栈' },
  ]);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((x) => x.slideId), ['slide-001', 'slide-002']);
});

test('does not merge unrelated pages whose OCR title is only one character', () => {
  const sample = new Uint8Array([128, 128, 128, 128]);
  const other = new Uint8Array([130, 130, 130, 130]);
  const slides = clusterSlideVersions([
    { time: 0, sample, ocrText: '1 第一页内容' },
    { time: 5, sample: other, ocrText: '1 第二页完全不同的内容' },
  ], { slideVisual: 0.8, slideText: 0.65 });
  assert.equal(slides.length, 2);
});
