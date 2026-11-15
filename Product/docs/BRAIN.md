# NASTRA — Brain v0.3

The whole action flow, text only: **normalize → independent safety check → interpret → decide action → retrieve through the tool gateway → pattern analysis → evidence → explanation (model) → validate → compose → log**.

## Files

```
src/nastra/
  types.ts               shared vocabulary (matches DB CHECK constraints)
  normalize.ts           typed text = instruction, attachments = evidence (code, no AI)
  safety/redflags.ts     deterministic red-flag screen, negation-aware (DEMO list)
  interpret/schema.ts    zod schema → strict JSON Schema for the model
  interpret/prompt.ts    system prompt + 2 examples + <crew_message>/<evidence> wrapping
  interpret/interpret.ts model call 1, validate, 1 retry, low-confidence fallback
  llm/provider.ts        one OpenAI-compatible client (OpenRouter now, Ollama later)
  protocols/registry.ts  3 demo-draft protocols with cited NASA sources
  router.ts              code decides the action; urgency can only go up
  understand.ts          normalize → safety → interpret → route; a red flag never reaches the model
  db/                    Db contract + Supabase (server, secret key) and PGlite (tests) adapters
  tools/gateway.ts       telemetry · health · mission · knowledge tools; permission check + audit trail
  patterns.ts            deterministic "same as before?" comparison against similar past episodes
  evidence.ts            E1…En items: observed · context · pattern · knowledge, each with its source
  respond/respond.ts     model call 2: writes ONLY a short cited explanation
  respond/validate.ts    no diagnosis · no causation · no reassurance · no meds · every number cited
  respond/templates.ts   fixed texts: escalation, clarify, redirect, protocol next steps
  knowledge/chunk.ts     NASA snapshot → one chunk per page section (≤ 220 words)
  knowledge/embed.ts     local gte-small embeddings (384-d), no API; hashing stand-in for tests
  pipeline.ts            handleMessage() · closeEvent() · commitLog() — writes health_events, event_turns, tool_calls
eval/cases.json          28 test messages with expected outcomes
scripts/run-eval.ts      scores one or more models on the test set
scripts/try.ts           try a single message
tests/                   49 tests, incl. the full tilting story end-to-end on an in-memory Postgres
```

## Run it (on your PC, in `Product/`)

```bash
npm install
npm test                                  # 39 unit tests, no network
npm run eval:offline                      # safety screen on all 28 cases, no network
npm run eval -- --models google/gemma-4-26b-a4b-it,google/gemma-4-31b-it
npm run try -- --model google/gemma-4-26b-a4b-it "I feel the room is tilting"
npm run chat                              # talk to NASTRA: real Supabase data + real model
```

In the chat: `/reseed` puts "now" at 30 min after crew_02's exercise, then type *I feel the room is tilting*.

Results land in `eval/results/<timestamp>.json`. Put the winner in `.env.local` as `NASTRA_MODEL_INTERPRET`.

## How a decision is made

| Order | Rule | Who decides |
|---|---|---|
| 1 | Red-flag phrase in the text → escalate. Model is not called | Code |
| 2 | Open event + "yes" to a red-flag question → escalate | Code |
| 3 | Model says urgency `warning` → escalate | Model can raise only |
| 4 | Open event → continue the protocol, ask what's still missing | Code |
| 5 | Low confidence → ask a clarifying question | Code |
| 6 | `log` → confirm before writing · `health_data` → answer from data · `out_of_scope` → redirect | Code |
| 7 | Symptom / psychological report → select protocol, ask its mandatory questions, show its immediate step | Code |

Final urgency = the highest of: safety floor, protocol base, model hint. It never goes down.

## Protocols (demo drafts — need flight-surgeon review before real use)

| Protocol | Triggers | First turn asks | Direct sources cited |
|---|---|---|---|
| `sensorimotor_disorientation` | physical + sensorimotor_vestibular | red flags · onset · safety-critical task | HRP Sensorimotor & Vestibular, Cardiovascular Adaptations, Cardiorespiratory & Musculoskeletal Fitness |
| `acute_stress` | psychological | red flags (incl. self-harm) · trigger · current task | HRP Behavioral Conditions & Psychiatric Disorders, Inadequate Sleep & Irregular Schedules |
| `general_physical` | any other physical symptom | red flags · onset · severity 1–10 | NASA-STD-3001 Longitudinal Health Surveillance (indirect) |

## Honest limits

- The red-flag list is ours, not NASA's. No NASA page provides one. It's labelled as a demo list in code.
- Negation handling is simple (a 40-character window before the match, inside one clause). It's tested against the cases we know about, not against everything.
- Asking a model to rate its own confidence is only roughly reliable. We use it as high / medium / low, and low always means "ask".

## Who writes what in a reply

| Part of the reply | Written by |
|---|---|
| Urgency, action, protocol choice | Code |
| Immediate step ("hold on to a handrail…") | Protocol text, verbatim |
| Explanation (2–4 sentences, cited [E#]) | Model, then validated; fact-only fallback if it fails twice |
| Questions | Protocol text, verbatim |
| Next steps + recheck | Protocol text, verbatim |
| Escalation | Fixed text; model not called |
| Evidence panel | Code, from the database via the tool gateway |

## Knowledge base (direct NASA source)

`knowledge/hrp_snapshot.json` holds the text of six NASA HRP risk pages (retrieved 2026-11-14): sensorimotor & vestibular, cardiovascular, behavioral, sleep, cardiorespiratory & musculoskeletal fitness, SANS. → 18 chunks.

```bash
npm run ingest -- --dry     # see the chunks
npm run ingest              # embed locally + upsert into Supabase (re-runnable)
npm run knowledge:test      # 7 queries must return the right NASA page first
```

At runtime: the protocol's tags **filter** the chunks (a dizziness question can never pull behavioral text), then the query vector **ranks** what's left. No embedder or no vectors → tag order. The top 2 chunks become evidence with NASA's wording and the page URL.

## Logs

- Live chats: `health_events` (one per conversation) · `event_turns` (every message, with interpretation, action, trace, validation result) · `tool_calls` (every data lookup).
- `/reseed` copies live chats into `session_archive` first, then resets. Nothing is lost, and old test chats never show up as "similar episodes" in the next demo.
