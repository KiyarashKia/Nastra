# NASTRA — Data model v0.1

Every structure here is tied to a NASA or CSA source (see `docs/NASA_SOURCES.md` in the project).
**Direct** = content retrieved and cited in-app. **Indirect** = the source shaped the design.

## Tables

| Table | What it holds | Shaped by |
|---|---|---|
| `missions`, `crew_members` | Fictional mission NX-1 and 3 fictional crew | — |
| `vitals` | HR, HRV (RMSSD), SpO2, respiration, skin temp, BP, activity. 15-min samples, 5-min for the last 3 h | CSA Bio-Monitor (Astroskin) channels — indirect |
| `sleep_logs` | Sleep window, hours, self-rated quality, awakenings | NASA Spaceflight Standard Measures (actigraphy + sleep reports) — indirect |
| `mood_logs` | Mood, stress, fatigue (1–5) + free-text note | NASA Standard Measures / BHP Standard Measures (self-report) — indirect |
| `mission_events` | Timeline: sleep, exercise, briefings, science, EVA prep, EVA | NASA HRP Hazards (isolation, distance, workload context) — indirect |
| `health_events` | Every health conversation: what was said, how it was classified, protocol, context snapshot, outcome. Also the history the pattern matcher searches | NASA-STD-3001 Vol 1, Longitudinal Health Surveillance brief — indirect |
| `event_turns` | Each message inside an event (crew / NASTRA / system) — follow-ups stay in the same event | same as above |
| `tool_calls` | Audit trail of every tool the orchestrator called | NASTRA safety principle: auditable |
| `knowledge_snippets` | Chunks of approved NASA/CSA pages with URL, tags, 384-dim embedding | NASA HRP risk pages, NASA-STD-3001 — **direct, cited** |

## Functions (what the tool gateway calls)

| Function | Returns | Notes |
|---|---|---|
| `vitals_baseline(crew, as_of, days)` | Personal resting mean/SD per metric | Awake, low activity, excludes last 24 h |
| `vitals_deviation(crew, as_of, window_min)` | Recent window vs resting baseline (z-score) | Statistical deviation, **not** a clinical threshold. UI must say so |
| `post_exercise_comparison(crew, as_of, window_min)` | Now vs *this person's* usual values at the same minutes after exercise | Use instead of resting baseline when exercise ended < 3 h ago |
| `similar_episodes(crew, body_system, domain, mission_context, before)` | Past resolved/escalated events with a score and `matched_on` | Structured, explainable. No vectors |
| `match_knowledge(embedding, allowed_tags, k)` | Top-k snippets inside the protocol's allowed tags | Filter first (deterministic), rank second (semantic) |
| `nastra_reseed(anchor)` | Counts | Wipes and regenerates simulated data. Server only |

## Planted demo story (anchor = now = 16:00 station time)

**crew_02 — R. Tanaka, Flight Engineer** (primary demo)
- Last 3 nights: 5.1 h, 5.4 h, 4.9 h (EVA prep schedule). Morning check-in: stress 4, fatigue 4, *"Short night again. EVA prep is on my mind."*
- Exercise ended 15:30 → now is 30 min post-exercise.
- Now vs their usual 30 min after exercise: HR ≈ 91 vs ≈ 74, BP ≈ 103/66 vs ≈ 111/72, HRV lower.
- Two past episodes, both post-exercise, short sleep, stress 4, resolved with rest + fluids:
  - day −16: *"Feeling a bit off-balance after the treadmill session."*
  - day −7: *"The room spun a little when I turned my head after exercise."*
- Coming up: EVA procedures briefing today 17:00, EVA prep tomorrow, EVA 1 in two days.

**crew_03 — L. Okafor** (second story): stress before EVA briefings on days −12 and −5; one past event *"Can't switch off before the EVA briefing. My heart is racing."* resolved with paced breathing.

**crew_01 — A. Moreau** (control): normal pattern, one past sleep question.

## Enumerations

- `speech_act`: report · question · log · request
- `domain`: physical_symptom · psychological · health_data · out_of_scope
- `urgency`: nominal · advisory · caution · warning
- `confidence`: high · medium · low
- `mission_context`: habitat · exercise · post_exercise · pre_eva · eva · post_eva · sleep · other
- `body_system` (inside `symptoms`): follows the HRP risk taxonomy — sensorimotor_vestibular, cardiovascular, behavioral_health, sleep, …
- `health_events.status`: open → awaiting_followup → resolved | escalated
