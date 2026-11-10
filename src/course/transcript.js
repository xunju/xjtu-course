/** Transcript acquisition for course videos: embedded subtitles first, ASR hook second. */

import { spawn } from 'node:child_process';
import { probeVideo } from '../storyboard/probe.js';
import { transcribeLong } from '../storyboard/asr.js';

export function parseSrt(text) {
  const out = [];
  const blocks = String(text ?? '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const time = lines.find((line) => line.includes('-->'));
    if (!time) continue;
    const [start, end] = time.split('-->').map((x) => parseSrtTime(x.trim()));
    const body = lines.slice(lines.indexOf(time) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && body) out.push({ start, end, text: body, source: 'embedded' });
  }
  return out;
}

export function parseSrtTime(value) {
  const m = String(value).match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return NaN;
  return (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (x) => { stdout += x; });
    child.stderr.on('data', (x) => { stderr += x; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`)));
  });
}

/** Extract the first embedded subtitle track; returns null when the container has none. */
export async function extractEmbeddedTranscript(input, { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' } = {}) {
  const probe = await runFfmpeg(ffprobe, ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=index', '-of', 'json', input]);
  let info;
  try { info = JSON.parse(probe); } catch { info = {}; }
  if (!info.streams?.length) return { source: 'none', segments: [], reason: 'no embedded subtitle track' };
  const srt = await runFfmpeg(ffmpeg, ['-v', 'error', '-i', input, '-map', '0:s:0', '-f', 'srt', 'pipe:1']);
  const segments = parseSrt(srt);
  return { source: 'embedded', segments, reason: segments.length ? null : 'subtitle track contained no readable cues' };
}

export function transcriptStatus(result, { asrConfigured = false } = {}) {
  if (result?.segments?.length) return { state: 'ready', source: result.source, segments: result.segments.length };
  if (asrConfigured) return { state: 'asr-required', source: result?.source ?? 'none', segments: 0 };
  return { state: 'not-configured', source: result?.source ?? 'none', segments: 0, reason: 'configure an ASR endpoint or provide transcript JSON' };
}

/** Use the repository's chunked ASR client when no embedded subtitles exist. */
export async function transcribeCourse(input, {
  ffmpegPath, baseUrl, model, apiKey, language, maxChunk = 45,
} = {}) {
  const info = await probeVideo(input, { ffmpegPath });
  if (!(info.duration > 0)) throw new Error('cannot determine course video duration');
  const result = await transcribeLong({
    input, start: 0, end: info.duration, ffmpegPath, baseUrl, model, apiKey, language, maxChunk,
  });
  if (!result) return { source: 'asr', segments: [], reason: 'ASR endpoint not configured or unavailable' };
  return { source: 'asr', segments: result.segments ?? [], model: result.model, language: result.language,
    chunks: result.chunks, reason: result.empty ? 'ASR returned no speech' : null };
}
