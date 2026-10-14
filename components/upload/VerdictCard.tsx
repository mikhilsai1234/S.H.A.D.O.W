"use client"

import { motion } from 'framer-motion'
import { Bot, Camera, HelpCircle, ShieldAlert, ShieldCheck, Scissors } from 'lucide-react'
import { getVerdict, type AnalysisResult } from '@/lib/verdict'

interface VerdictCardProps {
  result: AnalysisResult
}

const VERDICT_STYLES = {
  'AI GENERATED': {
    Icon: Bot,
    accent: 'text-rose-300',
    bar: 'bg-rose-400',
    border: 'border-rose-400/25',
  },
  'AI GENERATED / DEEPFAKE VIDEO': {
    Icon: Bot,
    accent: 'text-rose-300',
    bar: 'bg-rose-400',
    border: 'border-rose-400/25',
  },
  'LIKELY AI GENERATED': {
    Icon: ShieldAlert,
    accent: 'text-orange-300',
    bar: 'bg-orange-400',
    border: 'border-orange-400/25',
  },
  INCONCLUSIVE: {
    Icon: HelpCircle,
    accent: 'text-amber-200',
    bar: 'bg-amber-300',
    border: 'border-amber-300/20',
  },
  'POSSIBLY EDITED': {
    Icon: Scissors,
    accent: 'text-amber-200',
    bar: 'bg-amber-300',
    border: 'border-amber-300/20',
  },
  'LIKELY REAL': {
    Icon: ShieldCheck,
    accent: 'text-lime-200',
    bar: 'bg-lime-300',
    border: 'border-lime-300/20',
  },
  'REAL IMAGE': {
    Icon: Camera,
    accent: 'text-green-300',
    bar: 'bg-green-400',
    border: 'border-green-400/25',
  },
  'REAL VIDEO': {
    Icon: Camera,
    accent: 'text-green-300',
    bar: 'bg-green-400',
    border: 'border-green-400/25',
  },
} as const

export default function VerdictCard({ result }: VerdictCardProps) {
  const verdict = getVerdict(result)
  const { Icon } = VERDICT_STYLES[verdict.label]
  const aiProbability = Math.round(verdict.aiProbability)
  const realProbability = 100 - aiProbability

  return (
    <motion.section
      aria-label={`Final verdict: ${verdict.label}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={`w-full rounded-3xl border bg-[#1a1a1a] p-6 md:p-8 ${VERDICT_STYLES[verdict.label].border}`}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className={`mt-1 rounded-2xl border border-current/20 bg-white/[0.03] p-3 ${VERDICT_STYLES[verdict.label].accent}`}>
            <Icon aria-hidden="true" className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-3">
            <p className="text-xs font-light tracking-[3px] uppercase text-white/45">
              Final verdict
            </p>
            <h3 className={`text-2xl font-light tracking-[3px] uppercase md:text-3xl ${VERDICT_STYLES[verdict.label].accent}`}>
              {verdict.label}
            </h3>
            <p className="max-w-3xl text-sm leading-relaxed text-white/75">
              {verdict.explanation}
            </p>
            <p className="text-sm text-white/65">
              <span className="font-medium text-white/85">Type:</span> {verdict.mediaTypeDescription}
            </p>
          </div>
        </div>

        <div className="w-full shrink-0 space-y-3 md:max-w-sm">
          <div className="flex items-center justify-between gap-3 text-xs tracking-wide">
            <span className="text-green-300">Real {realProbability}%</span>
            <span className={VERDICT_STYLES[verdict.label].accent}>AI {aiProbability}%</span>
          </div>
          <div
            role="img"
            aria-label={`Likelihood: ${realProbability}% real and ${aiProbability}% AI-generated`}
            className="flex h-3 overflow-hidden rounded-full bg-white/10"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${realProbability}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-green-400"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${aiProbability}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full ${VERDICT_STYLES[verdict.label].bar}`}
            />
          </div>
          <p className="text-xs leading-relaxed text-white/45">
            {verdict.hasExplicitAiProbability
              ? 'Model-reported AI probability; model scores may not be calibrated.'
              : 'Estimate based on the manipulation score; it is not a calibrated AI probability.'}
          </p>
        </div>
      </div>

      <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
        Automated analysis is probabilistic and may be wrong. Do not use as sole evidence.
      </p>
    </motion.section>
  )
}
