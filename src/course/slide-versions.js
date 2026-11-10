/**
 * PPT page/version clustering.
 *
 * A slide is a logical page. A version is one visible state of that page
 * (progressive animation, annotation, or revealed answer). The algorithm is
 * deliberately deterministic and keeps every version; an AI summary layer
 * can be added later without deciding which evidence to delete.
 */

export function normalizeOcrText(value) {
  return String(value ?? '')
    // Recorder overlays: date/time and the fixed watermark must not create
    // a fake PPT version when the same page reappears later.
    .replace(/\d{1,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?[^\d\n]{0,8}\d{1,2}[：:]\d{2}[：:]\d{2}/gu, ' ')
    .replace(/\b\d{1,2}[：:]\d{2}[：:]\d{2}\b/g, ' ')
    // The fixed recorder watermark is frequently misread (l/1, o/0, etc.).
    .replace(/\bdongy[\p{L}\p{N}_-]{0,12}\b/giu, ' ')
    .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();
}

const clean = normalizeOcrText;

function tokens(text) {
  return new Set(clean(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

export function textSimilarity(a, b) {
  const aa = tokens(a);
  const bb = tokens(b);
  if (aa.size === 0 && bb.size === 0) return 1;
  if (aa.size === 0 || bb.size === 0) return 0;
  let common = 0;
  for (const t of aa) if (bb.has(t)) common += 1;
  return common / (aa.size + bb.size - common);
}

/** Mean absolute difference for equal grayscale sample arrays (0..255). */
export function pixelSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff += Math.abs(a[i] - b[i]);
  return 1 - diff / (255 * a.length);
}

function titleOf(text) {
  return clean(String(text ?? '').split(/[\n。！？.!?]/u)[0]);
}

function sameVersion(candidate, version, options) {
  const visual = pixelSimilarity(candidate.sample, version.sample);
  const text = textSimilarity(candidate.ocrText, version.ocrText);
  return visual >= options.versionVisual && text >= options.versionText;
}

function sameSlide(candidate, slide, options) {
  const visual = pixelSimilarity(candidate.sample, slide.representative.sample);
  const text = textSimilarity(candidate.ocrText, slide.titleText);
  // A returning page must have visual evidence; title-only matches are unsafe.
  // Without OCR, only near-identical images may be merged. Treating every
  // visually similar page as one slide would collapse progressive PPT states.
  if (!clean(candidate.ocrText) || !slide.titleText) return visual >= options.versionVisual;
  const candidateTitle = titleOf(candidate.ocrText);
  const usableTitles = candidateTitle.length >= 3 && slide.titleText.length >= 3;
  return visual >= options.slideVisual && (text >= options.slideText
    || (usableTitles && candidateTitle === slide.titleText));
}

/**
 * @param {Array<{time:number,image?:string,sample?:Uint8Array,ocrText?:string,sharpness?:number}>} candidates
 * @param {{versionVisual?:number,versionText?:number,slideVisual?:number,slideText?:number}} options
 */
export function clusterSlideVersions(candidates, options = {}) {
  const cfg = {
    // Stable course-PPT defaults: retain subtle animation/annotation changes.
    versionVisual: 0.999,
    // OCR on compressed Chinese slides is noisy; use it as a guard, not an
    // exact checksum. The visual threshold still prevents unrelated white
    // slides from merging.
    versionText: 0.98,
    slideVisual: 0.999,
    slideText: 0.99,
    ...options,
  };
  const slides = [];
  const ordered = [...(candidates ?? [])].sort((a, b) => Number(a.time) - Number(b.time));
  for (const raw of ordered) {
    const candidate = { ...raw, time: Number(raw.time), ocrText: String(raw.ocrText ?? '') };
    if (!Number.isFinite(candidate.time)) continue;

    let version = null;
    for (const slide of slides) {
      for (const v of slide.versions) {
        if (sameVersion(candidate, v, cfg)) { version = { slide, v }; break; }
      }
      if (version) break;
    }
    if (version) {
      version.v.occurrences.push(candidate.time);
      version.v.lastSeen = candidate.time;
      if ((candidate.sharpness ?? -Infinity) > (version.v.sharpness ?? -Infinity)) {
        version.v.image = candidate.image;
        version.v.sample = candidate.sample;
        version.v.sharpness = candidate.sharpness;
      }
      continue;
    }

    const slide = slides.find((s) => sameSlide(candidate, s, cfg));
    if (slide) {
      const next = {
        versionId: `${slide.slideId}-v${slide.versions.length + 1}`,
        image: candidate.image,
        sample: candidate.sample,
        ocrText: candidate.ocrText,
        sharpness: candidate.sharpness,
        firstSeen: candidate.time,
        lastSeen: candidate.time,
        occurrences: [candidate.time],
      };
      slide.versions.push(next);
      continue;
    }

    const slideId = `slide-${String(slides.length + 1).padStart(3, '0')}`;
    const first = {
      versionId: `${slideId}-v1`, image: candidate.image, sample: candidate.sample,
      ocrText: candidate.ocrText, sharpness: candidate.sharpness,
      firstSeen: candidate.time, lastSeen: candidate.time, occurrences: [candidate.time],
    };
    slides.push({
      slideId,
      titleText: titleOf(candidate.ocrText),
      firstSeen: candidate.time,
      lastSeen: candidate.time,
      representative: candidate,
      versions: [first],
    });
  }
  return slides.map(({ representative, ...slide }) => ({
    ...slide,
    lastSeen: Math.max(...slide.versions.map((v) => v.lastSeen)),
  }));
}
