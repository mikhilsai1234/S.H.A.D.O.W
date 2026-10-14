export const VERDICT_THRESHOLDS = {
  confidence: 50,
  aiGenerated: 75,
  likelyAiGenerated: 55,
  inconclusive: 35,
  likelyReal: 15,
} as const

export const VIDEO_INDICATOR_BOOSTS = {
  physiological: 10,
  lighting: 5,
  lipSync: 10,
  temporal: 5,
  blink: 5,
} as const

export type MediaType = 'image' | 'video'

export interface AnalysisResult {
  mediaType: MediaType
  manipulationScore: number
  confidenceScore: number
  indicators: string[]
  aiProbability?: number
  label?: string
  hasEnoughData: boolean
}

export type VerdictLabel =
  | 'AI GENERATED'
  | 'AI GENERATED / DEEPFAKE VIDEO'
  | 'LIKELY AI GENERATED'
  | 'INCONCLUSIVE'
  | 'POSSIBLY EDITED'
  | 'LIKELY REAL'
  | 'REAL IMAGE'
  | 'REAL VIDEO'

export type MediaTypeDescription =
  | 'Face-swap / Deepfake'
  | 'Fully AI-generated video'
  | 'Edited / spliced video'
  | 'Unaltered video'
  | 'Fully AI-generated'
  | 'Edited/Photoshopped'
  | 'Unaltered photo'
  | 'Unable to determine'

export interface Verdict {
  label: VerdictLabel
  explanation: string
  aiProbability: number
  hasExplicitAiProbability: boolean
  mediaTypeDescription: MediaTypeDescription
}

type DataRecord = Record<string, unknown>

function asRecord(value: unknown): DataRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord
    : {}
}

export function toScorePercentage(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric))
}

function firstNumber(record: DataRecord, keys: string[]): number | null {
  for (const key of keys) {
    const score = toScorePercentage(record[key])
    if (score !== null) return score
  }
  return null
}

function appendStrings(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    target.push(value.trim())
  } else if (Array.isArray(value)) {
    value.forEach((entry) => appendStrings(target, entry))
  }
}

function collectIndicators(raw: DataRecord): string[] {
  const indicators: string[] = []
  appendStrings(indicators, raw.indicators)
  appendStrings(indicators, raw.signals)
  appendStrings(indicators, raw.key_indicators)
  appendStrings(indicators, raw.keyIndicators)

  const breakdown = asRecord(raw.analysis_breakdown)
  const neural = asRecord(breakdown.neural_network)
  const frequency = asRecord(breakdown.frequency_domain)
  const metadata = asRecord(breakdown.metadata_forensics)
  const facial = asRecord(breakdown.facial_analysis)

  if (neural.model_agreement === 'disagreement') {
    indicators.push('Conflicting predictions between neural models')
  }
  if (toScorePercentage(neural.score) !== null && Number(neural.score) > 0.65) {
    indicators.push('Multiple deepfake detection models flagged this content')
  }
  if (frequency.dct_anomaly) indicators.push('DCT frequency anomalies detected')
  if (frequency.fft_anomaly) indicators.push('FFT patterns suggest synthetic generation')
  if (toScorePercentage(frequency.high_freq_score) !== null && Number(frequency.high_freq_score) > 0.7) {
    indicators.push('Unusual high-frequency artifacts present')
  }
  if (metadata.exif_present === false) indicators.push('No EXIF metadata found (may indicate processing)')
  if (metadata.ela_anomalies) indicators.push('Compression mismatch detected between regions')
  if (metadata.exif_suspicious) indicators.push('EXIF data contains suspicious patterns')
  if (facial.symmetry_anomaly) indicators.push('Facial asymmetry exceeds natural variation')
  if (facial.eye_anomaly) indicators.push('Eye region shows synthetic characteristics')
  if (facial.texture_anomaly) indicators.push('Skin texture appears artificially smooth or generated')

  const layers = asRecord(raw.layer_summaries)
  const temporal = asRecord(asRecord(layers.visual).temporal)
  const physics = asRecord(layers.physics)
  const physiological = asRecord(layers.physiological)
  const audio = asRecord(layers.audio)
  const specialized = asRecord(layers.specialized)
  const boundary = asRecord(specialized.boundary)
  const compression = asRecord(specialized.compression)

  appendStrings(indicators, temporal.anomalies)
  appendStrings(indicators, physics.anomalies)
  appendStrings(indicators, physiological.anomalies)
  appendStrings(indicators, audio.anomalies)

  if (physiological.heartbeat_detected === false) indicators.push('No heartbeat detected')
  if (physiological.natural_blink_pattern === false) indicators.push('Unnatural blink pattern observed')
  if (physics.lighting_consistent === false) indicators.push('Inconsistent physical lighting cues')
  if (audio.lip_sync === false || audio.lip_sync_consistent === false) {
    indicators.push('Audio and lip sync mismatch detected')
  }
  if (typeof audio.lip_sync_score === 'number' && audio.lip_sync_score >= 0.7) {
    indicators.push('Lip sync mismatch detected')
  }
  if (typeof boundary.suspicious_transitions === 'number' && boundary.suspicious_transitions > 0) {
    indicators.push('Frame inconsistency: suspicious transitions detected')
  }
  if (typeof compression.mismatches === 'number' && compression.mismatches > 0) {
    indicators.push('Compression mismatch between regions; possible splicing')
  }

  return Array.from(new Set(indicators))
}

export function normalizeResult(rawResult: unknown, mediaType: MediaType): AnalysisResult {
  const raw = asRecord(rawResult)
  const manipulationScore = firstNumber(raw, [
    'ai_generated_probability',
    'aiProbability',
    'fake_probability',
    'average_fake_probability',
    'final_score',
    'finalScore',
    'manipulation_score',
    'manipulationScore',
    'score',
  ])
  const confidenceScore = firstNumber(raw, ['confidence', 'confidence_score', 'confidenceScore'])
  const aiProbability = firstNumber(raw, [
    'ai_generated_probability',
    'aiProbability',
    'fake_probability',
    'average_fake_probability',
  ])
  const indicators = collectIndicators(raw)

  return {
    mediaType,
    manipulationScore: manipulationScore ?? 0,
    confidenceScore: confidenceScore ?? 0,
    indicators,
    ...(aiProbability !== null ? { aiProbability } : {}),
    ...(typeof raw.label === 'string' ? { label: raw.label } : {}),
    hasEnoughData: manipulationScore !== null && confidenceScore !== null,
  }
}

function adjustedVideoScore(score: number, indicators: readonly string[]): number {
  const has = (pattern: RegExp) => indicators.some((indicator) => pattern.test(indicator.toLowerCase()))
  let adjusted = score

  if (has(/no heartbeat|no pulse|\brppg\b/)) adjusted += VIDEO_INDICATOR_BOOSTS.physiological
  if (has(/lighting.{0,30}inconsistent|inconsistent.{0,30}lighting/)) {
    adjusted += VIDEO_INDICATOR_BOOSTS.lighting
  }
  if (has(/lip[\s-]?sync|audio.{0,20}mismatch/)) adjusted += VIDEO_INDICATOR_BOOSTS.lipSync
  if (has(/temporal|flicker|frame inconsistency/)) adjusted += VIDEO_INDICATOR_BOOSTS.temporal
  if (has(/abnormal.{0,20}blink|unnatural blink|blink.{0,20}abnormal/)) {
    adjusted += VIDEO_INDICATOR_BOOSTS.blink
  }

  return Math.min(100, adjusted)
}

function labelFromExplicitValue(value: string | undefined, mediaType: MediaType): VerdictLabel | null {
  if (!value) return null

  const label = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (label.includes('inconclusive') || label.includes('uncertain') || label.includes('unknown')) {
    return 'INCONCLUSIVE'
  }
  if (label.includes('likely') && (label.includes('ai') || label.includes('fake') || label.includes('synthetic'))) {
    return 'LIKELY AI GENERATED'
  }
  if (label.includes('ai') || label.includes('fake') || label.includes('synthetic') || label.includes('deepfake')) {
    return mediaType === 'video' ? 'AI GENERATED / DEEPFAKE VIDEO' : 'AI GENERATED'
  }
  if (label.includes('likely') && (label.includes('real') || label.includes('authentic'))) {
    return 'LIKELY REAL'
  }
  if (label.includes('real') || label.includes('authentic') || label.includes('genuine')) {
    return mediaType === 'video' ? 'REAL VIDEO' : 'REAL IMAGE'
  }

  return null
}

function inferMediaTypeDescription(result: AnalysisResult): MediaTypeDescription {
  const indicators = result.indicators.map((indicator) => indicator.toLowerCase())
  const has = (pattern: RegExp) => indicators.some((indicator) => pattern.test(indicator))

  if (result.mediaType === 'image') {
    if (has(/compression mismatch|ela anomal|splic|localized edit|photoshop|tamper/)) {
      return 'Edited/Photoshopped'
    }
    if (has(/ai.generated|generated by ai|deepfake|synthetic generation|synthetic characteristics/)) {
      return 'Fully AI-generated'
    }
    if (has(/no exif|missing exif|exif metadata/) && has(/high.frequency|frequency anomal|dct|fft|synthetic/)) {
      return 'Fully AI-generated'
    }
    return 'Unable to determine'
  }

  if (has(/fully ai.generated|synthetic generation|generated video/)) {
    return 'Fully AI-generated video'
  }
  if (has(/compression mismatch|splic|suspicious transition|localized edit/)) return 'Edited / spliced video'
  if (has(/face.swap|deepfake|identity shift|identity instability|no heartbeat|no pulse|\brppg\b|lip[\s-]?sync|audio.{0,20}mismatch|lighting|blink|temporal|flicker/)) {
    return 'Face-swap / Deepfake'
  }
  if (
    result.hasEnoughData
    && result.confidenceScore >= VERDICT_THRESHOLDS.confidence
    && result.aiProbability === undefined
    && result.manipulationScore < VERDICT_THRESHOLDS.likelyReal
    && result.indicators.length === 0
  ) {
    return 'Unaltered video'
  }
  return 'Unable to determine'
}

function getExplanation(label: VerdictLabel, result: AnalysisResult): string {
  if (!result.hasEnoughData) return 'Not enough data to decide.'

  if (result.mediaType === 'video' && label === 'LIKELY AI GENERATED') {
    const physiological = result.indicators.some((indicator) =>
      /no heartbeat|no pulse|\brppg\b/i.test(indicator),
    )
    const lighting = result.indicators.some((indicator) =>
      /lighting.{0,30}inconsistent|inconsistent.{0,30}lighting/i.test(indicator),
    )
    if (physiological && lighting) {
      return 'Missing physiological signals and inconsistent lighting cues suggest this video may be AI-generated.'
    }
    if (physiological) return 'Missing physiological signals suggest this video may be AI-generated.'
    if (lighting) return 'Inconsistent lighting cues suggest this video may be AI-generated.'
  }

  if (label === 'INCONCLUSIVE') {
    return 'The available signals do not provide enough confidence to determine whether this media is AI-generated.'
  }
  if (label === 'POSSIBLY EDITED') {
    return 'Signals suggest possible editing or splicing, but do not establish that this media is AI-generated.'
  }
  if (label === 'AI GENERATED / DEEPFAKE VIDEO') {
    return 'Our models found strong signs this video was AI-generated or manipulated as a deepfake.'
  }
  if (label === 'AI GENERATED') {
    return 'Our models found strong signs this image was generated or heavily manipulated by AI.'
  }
  if (label === 'LIKELY AI GENERATED') {
    return result.mediaType === 'video'
      ? 'Our models found several signs this video may have been generated or altered by AI.'
      : 'Our models found several signs that this image may have been generated or altered by AI.'
  }
  if (label === 'LIKELY REAL') {
    return 'Our models found few signs of AI generation, though this result is not definitive.'
  }
  return result.mediaType === 'video'
    ? 'Our models found very few signs of AI generation or significant manipulation in this video.'
    : 'Our models found very few signs of AI generation or significant manipulation.'
}

export function getVerdict(result: AnalysisResult): Verdict {
  const confidence = toScorePercentage(result.confidenceScore) ?? 0
  const baseScore = result.aiProbability ?? result.manipulationScore
  const score = toScorePercentage(baseScore) ?? 0
  const aiProbability = result.mediaType === 'video'
    ? adjustedVideoScore(score, result.indicators)
    : score
  const explicitLabel = labelFromExplicitValue(result.label, result.mediaType)

  let label: VerdictLabel
  if (!result.hasEnoughData) {
    label = 'INCONCLUSIVE'
  } else if (confidence < VERDICT_THRESHOLDS.confidence) {
    label = 'INCONCLUSIVE'
  } else if (explicitLabel) {
    label = explicitLabel
  } else if (result.mediaType === 'video' && aiProbability >= VERDICT_THRESHOLDS.aiGenerated) {
    label = 'AI GENERATED / DEEPFAKE VIDEO'
  } else if (aiProbability >= VERDICT_THRESHOLDS.aiGenerated) {
    label = 'AI GENERATED'
  } else if (aiProbability >= VERDICT_THRESHOLDS.likelyAiGenerated) {
    label = 'LIKELY AI GENERATED'
  } else if (aiProbability >= VERDICT_THRESHOLDS.inconclusive && result.indicators.some((indicator) =>
    /compression mismatch|ela anomal|splic/i.test(indicator),
  )) {
    label = 'POSSIBLY EDITED'
  } else if (aiProbability >= VERDICT_THRESHOLDS.inconclusive) {
    label = 'INCONCLUSIVE'
  } else if (aiProbability >= VERDICT_THRESHOLDS.likelyReal) {
    label = 'LIKELY REAL'
  } else {
    label = result.mediaType === 'video' ? 'REAL VIDEO' : 'REAL IMAGE'
  }

  return {
    label,
    explanation: getExplanation(label, result),
    aiProbability,
    hasExplicitAiProbability: result.aiProbability !== undefined,
    mediaTypeDescription: inferMediaTypeDescription(result),
  }
}
