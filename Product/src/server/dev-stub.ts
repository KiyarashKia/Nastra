import type { LlmClient } from '../nastra/llm/provider';

/**
 * DEV ONLY. A keyword stub that stands in for the model so the Station UI can be
 * built and checked without a network. It is not a model and not a demo mode:
 * the UI labels it ("Model: offline stub"). Set NASTRA_LLM=stub to use it.
 */
export function devStubLlm(): LlmClient {
  return {
    async chatJson(req) {
      if (req.schemaName === 'interpretation') {
        const text = String(req.messages.at(-1)?.content ?? '').toLowerCase();
        const said = (text.match(/<crew_message>([\s\S]*?)<\/crew_message>/)?.[1] ?? text).trim().slice(0, 200);
        const tilt = /tilt|spin|dizz|balance/.test(said);
        const stress = /stress|anxious|overwhelm|can'?t switch off|worried/.test(said);
        const data = /\b(show|how did|what'?s my|trend)\b/.test(said);
        const interp = {
          speech_act: data ? 'question' : 'report',
          domain: data ? 'health_data' : stress ? 'psychological' : tilt || /feel|pain|ache|sick|nause|tired/.test(said) ? 'physical_symptom' : 'out_of_scope',
          secondary_domain: null,
          symptoms: tilt ? [{ said: said.replace(/^i feel (that )?/, '').replace(/[.!?]$/, ''), category: 'disorientation', body_system: 'sensorimotor_vestibular' }]
            : stress ? [{ said, category: 'acute_stress', body_system: 'behavioral_health' }]
            : /feel|pain|ache|sick|nause|tired/.test(said) ? [{ said, category: 'general', body_system: 'other' }] : [],
          onset: /just now/.test(said) ? 'just now' : /hour/.test(said) ? 'within the last hour' : null,
          duration: null,
          severity: /mild|moderate|severe/.exec(said)?.[0] ?? null,
          activity_context: null, log_entries: [],
          request_target: data ? (/sleep/.test(said) ? 'sleep_trend' : /stress/.test(said) ? 'stress_trend' : 'vitals_now') : null,
          followup_answers: [], urgency_hint: 'advisory',
          confidence: /maybe|kinda|not sure|i guess/.test(said) ? 'medium' : 'high', missing_info: [],
        };
        return { content: JSON.stringify(interp), latencyMs: 5, usedSchemaMode: 'json_schema' };
      }
      return {
        content: JSON.stringify({ explanation: 'Offline stub: no model text. The observations below are what NASTRA measured [E1].', cited: ['E1'] }),
        latencyMs: 5, usedSchemaMode: 'json_schema',
      };
    },
  };
}
