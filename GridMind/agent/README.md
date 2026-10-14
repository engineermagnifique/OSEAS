# GridMind

GridMind is an open-source AI assistant inside the Energy Access Explorer (EAE)
map: you ask in plain language, and it builds the priority map for you, then
explains what you are looking at.

The AskEAE brief says many EAE users cannot use the platform fully because they
lack GIS skills. GridMind closes that gap in three ways:

- **It operates the map.** "Where should we build solar mini-grids?" turns on
  the right layers, sets the distance-to-grid filters, picks the index and
  redraws the priority map.
- **It answers with real places and numbers.** "Which counties have the most
  people far from the grid?" outlines and numbers the counties on the map and
  lists their values in the chat.
- **It explains the map.** "What do the colours mean?" turns every legend into
  plain words with the real value ranges.

It runs on an open-source model on a normal laptop, with no paid API key, and it
answers in English, French and Swahili.

## How the AI works

```
EAE map (eae-tool/src/chat.js)           GridMind agent (this folder, port 8787)        Model server (port 8081)
──────────────────────────────           ───────────────────────────────────────        ────────────────────────
question + map context + layer list ──►  POST /chat
                                         ├─ server.js   clear request? ── yes ──► rules.js (under 1 s)
                                         │                             └─ no ───► llm.js ──►  llama.cpp
                                         │                                                    Qwen2.5-1.5B-Instruct
                                         │              knowledge.js EAE prompt, catalog.js layers
                                         │              fixed JSON answer format       ◄──
                                         └─ actions.js  check every action
map runs the actions with EAE's     ◄──  { intent, reply, actions }
own controls and reports back
```

1. **The map sends the question with its context.** Alongside your words, the
   chat panel sends the country, the current index, the layers that are on, and
   the full list of layers that exist for this country (names, units, value
   ranges).
2. **The agent picks the fastest engine that can answer.** Clear, common
   requests ("turn on population", "where should we build mini-grids") go to a
   rules engine and are answered in under a second. Anything harder goes to the
   AI model: other languages, numbers, comparisons ("twice as important"),
   follow-ups, or anything the rules don't recognise.
3. **The model answers in a fixed format.** The model is told how EAE works
   (demand and supply layers, filters, importance, the four indexes, a recipe for
   each electricity solution). The model server forces its reply into a fixed
   JSON format: an intent, a reply, and a list of map actions.
4. **Every action is checked before it reaches the map.** Layer names the model
   made up are dropped. Importance values are kept between 1 and 5 and filter
   ranges inside each layer's real values, and a layer is turned on before it is
   filtered.
5. **The map does the work and reports back.** Each action presses the same
   buttons and sliders a person would use. When you ask for places, the map ranks
   the counties from EAE's own priority calculation, so the names and numbers in
   the chat come from EAE, not from the AI. The legend explanation is read from
   the colour scales the map actually draws.

**The model:** Qwen2.5-1.5B-Instruct, an open-source model (Apache 2.0 licence),
compressed to about 1.1 GB (Q4_K_M) and run by llama.cpp on the laptop's
processor. No paid API key, no data leaves the machine, and it works without a
graphics card.

**Why it is built this way:**

- **Rules plus a model, not the model alone.** On a laptop processor the model
  takes about 10–60 seconds; most everyday questions don't need it, so they are
  answered instantly.
- **A fixed format plus checks.** A small model sometimes invents things. The
  fixed format makes its answer always readable, and the checks stop invented
  layers from ever reaching the map.
- **Numbers come from EAE.** The AI decides *what* to set up; EAE computes the
  results. That way GridMind never makes up a statistic.

### What the map can be asked to do

| Action | What happens on the map |
|---|---|
| `activate` / `deactivate` | turn layers on or off |
| `filter` | set a layer's range (for points and lines: distance in km to the nearest one) |
| `weight` | set a layer's importance, 1–5 |
| `index` | switch between Energy Access Potential, Demand, Supply and Assistance Need |
| `areas` | rank counties or subcounties, outline and number them, list their values in the chat |
| `legend` | explain the priority colours and every active layer's colours and symbols with real values |
| `panel`, `results`, `export` | open a left panel, the results panel or the report export |

### Easy to read while it works

- **Legends in plain words.** A "What do these colours mean?" link under the
  Priority Legend opens GridMind and explains each colour (Low 0.0–0.2 up to High
  0.8–1.0), what the current index means, and every active layer's real value
  ranges, distances, filters and importance. It is built in the browser, so it
  works even when the agent or model is off.
- **A visible "still working" state.** Until every map change is done, the reply
  shows a spinner, the current step and a seconds counter, the header says
  "Thinking…", the text box says "GridMind is still working…", and a closed panel's
  button reads "GridMind is thinking…". At the end it shows "Finished in N s".

## How to start everything

Open three PowerShell windows and start them in this order. Keep all three open.

**Window 1: the AI model (port 8081).** Start this first; it takes a little
while to load.

```powershell
cd D:\OSEAS\GridMind\agent
.\start-llm.ps1
```

Check it: `curl.exe http://127.0.0.1:8081/health` should answer `{"status":"ok"}`.

**Window 2: the GridMind agent (port 8787).** Start this once Window 1 is ready.
Needs Node 20+; there are no npm packages to install.

```powershell
cd D:\OSEAS\GridMind\agent
node server.js
```

It should print
`GridMind agent on http://127.0.0.1:8787 (engine=auto, model=qwen2.5-1.5b-instruct-q4_k_m, llm ready)`.
If it says `NOT available, using rules`, Window 1 wasn't ready: press Ctrl+C and
run `node server.js` again.

**Window 3: the website and map (port 8080).** See the main
[README](../../README.md) for building `D:\eae-preview\dist` the first time.

```powershell
cd D:\eae-preview\dist
python -m http.server 8080
```

**Open the map:**
http://localhost:8080/tool/a/?id=562ffd81-d326-41e4-9ba0-2dedb21130b2 (Kenya).
Wait until "Fetching divisions…" disappears, then click **GridMind** at the
bottom right. The panel header should say
`Open-source AI · qwen2.5-1.5b-instruct-q4_k_m`.

**If something goes wrong:**

| What you see | Fix |
|---|---|
| "I can't reach the GridMind agent (Failed to fetch)" | Window 2 is not running. Start it with `node server.js`. |
| Window 2 shows `EADDRINUSE` | Another copy is already using port 8787. Close it, or find it with `Get-Process -Id (Get-NetTCPConnection -LocalPort 8787).OwningProcess`. |
| Header says "Guided mode (AI model offline)" | Window 1 is not running. Rules answers still work; start Window 1, then restart Window 2. |
| Map loads slowly or stays grey | The layer data comes from the live EAE server over the internet. Check the connection and reload. |
| Old behaviour after code changes | Press Ctrl+F5 in the browser. After changing the agent, restart Window 2. |

To stop everything, press Ctrl+C in each window. Before a demo, close other heavy
programs so the model has memory to run.

### Getting the model and settings

`start-llm.ps1` expects llama.cpp in `D:\llama.cpp` and the model in
`D:\llama.cpp\models`. Downloads: the llama.cpp CPU build
(`llama-*-bin-win-cpu-x64.zip`) from
https://github.com/ggml-org/llama.cpp/releases and
`qwen2.5-1.5b-instruct-q4_k_m.gguf` from
https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF. On a faster machine the
3B model gives better answers:
`.\start-llm.ps1 -Model D:\llama.cpp\models\qwen2.5-3b-instruct-q4_k_m.gguf`.
Ollama works too: `ollama pull qwen2.5:1.5b`, then set
`LLM_URL=http://127.0.0.1:11434` and `GRIDMIND_MODEL=qwen2.5:1.5b`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | agent port |
| `LLM_URL` | `http://127.0.0.1:8081` | OpenAI-compatible model server |
| `GRIDMIND_MODEL` | `qwen2.5-1.5b-instruct-q4_k_m` | model name sent to the server |
| `GRIDMIND_ENGINE` | `auto` | `auto` (rules for clear requests, model for the rest), `llm`, `rules` |
| `GRIDMIND_TIMEOUT` | `180000` | model request timeout (ms) |

For quick answers without the model: `$env:GRIDMIND_ENGINE="rules"; node server.js`.
In the map tool, `CHAT_URL` in `eae-tool/.env` points the panel at a deployed
agent; it defaults to `http://127.0.0.1:8787/chat`.

## How we measured accuracy

With the rules and the model together, GridMind took the correct map actions for
94.2% of 52 labelled questions, and it never invented a layer.

We wrote 58 real user questions in English, French and Swahili
(`data/intents.jsonl`). Each is labelled with its intent (one of 19, such as
mini-grid, stand-alone PV or explain the legend) and the map actions it should
cause, written as roles (`population`, `ghi`, `grid`, ...) so they apply to any
country. `eval.js` runs every question through the agent against Kenya's real
layer list (`data/catalog-kenya.json`) and scores intent accuracy, action
accuracy, invented layer ids and speed.

```powershell
node eval.js --engine=rules --out=results/rules.json
node eval.js --out=results/hybrid.json
node eval.js --engine=llm   --out=results/llm.json
```

| Setup | Questions | Correct actions | Invented layers |
|---|---|---|---|
| Rules and model together (what runs in the demo) | 52 | 94.2% | 0 |
| Rules only (no AI model) | 58 | 84.5% | 0 |

Honest limits:

- **French is the weakest language** (2 of 4 French questions correct in the
  combined run). Swahili has only 1 test question so far.
- **The 6 newest questions** (explaining the legend) were added after the
  combined run. They pass with rules alone, but the combined run has not been
  repeated on all 58.
- **The model is not fine-tuned.** We used a detailed instruction prompt, a
  worked example built from the country's real layers, a fixed answer format and
  action checks. The labelled questions are the starting dataset for
  fine-tuning later.
- **Speed:** on the test laptop (Intel i7-1255U, 16 GB RAM, no graphics card),
  questions sent to the model took about 9–27 seconds, and up to about 60
  seconds for long requests. Rules answers take under a second.

## Demo questions

Ask them in this order on the Kenya map; each builds on the one before.

**1. Pick the best solution for each place (the main goal)**

- Where should we build solar mini-grids?
- Which areas need stand-alone solar PV?
- Prioritise areas for grid extension

**2. Name real places, with numbers**

- Which counties have the most people living far from the grid?
- Show the top 5 counties with the highest energy access potential (model)

**3. Use each kind of data from the brief**

- People: Show me where the most people live
- Activity and productive uses: Turn on nighttime lights and health facilities
- Solar potential: Only keep areas with high solar potential (model)
- Power infrastructure: Keep only places more than 20 km from the distribution lines (model)

**4. Make the map easy to read**

- What do the colours on the map mean? (or click "What do these colours mean?"
  under the Priority Legend)
- Is dark purple high or low priority?
- Explain the population colour bar

**5. Adjust the analysis in your own words** (goes to the AI model, about
20–60 s, and shows the "still working" indicator)

- Make population twice as important as nighttime lights

**6. Remove the language barrier** (goes to the AI model)

- Où devrait-on construire des mini-réseaux solaires ? (French: "Where should we
  build solar mini-grids?")
- Nionyeshe vituo vya afya (Swahili: "Show me the health facilities")

**7. Finish with a report**

- Export this analysis as a PowerPoint report

Questions marked (model), and sections 5 and 6, go to the small AI model: they
take about 20–60 s and can occasionally be off; if one is, ask it again more
simply. All the others are answered by rules in under a second.

## Presenting to judges

**A 5-minute plan:**

| Time | What to do | What to say |
|---|---|---|
| 0:00–0:45 | Show the empty Kenya map | The problem from the brief: EAE is powerful, but planners without GIS skills don't know which layers, filters and index to use. |
| 0:45–1:30 | Ask "Where should we build solar mini-grids?" | One sentence sets up a whole mini-grid analysis: layers, distance from the grid, solar importance, index. |
| 1:30–2:15 | Ask "Which counties have the most people living far from the grid?" | The counties are outlined and numbered on the map; the numbers come from EAE's own calculation, not from the AI. |
| 2:15–3:00 | Click "What do these colours mean?" | Every legend explained in plain words with real values; works even offline. |
| 3:00–4:00 | Ask "Make population twice as important as nighttime lights" | While the spinner and timer run: this is the open-source model on this laptop, no API key, no data leaves the machine. |
| 4:00–4:30 | Ask the French or Swahili question | Breaking the language barrier, as the brief asks. |
| 4:30–5:00 | Show the accuracy table above | 58 labelled questions, 94.2% correct actions with rules and model together, 0 invented layers; honest about French and fine-tuning. |

**Talking points that match the brief:**

- Open-source model only (Qwen2.5, Apache 2.0, llama.cpp), as required.
- Labelled intents and expected actions for training and testing
  (`data/intents.jsonl`), and a measured accuracy (`eval.js`).
- Built into EAE in the platform's own plain-JavaScript style (`src/chat.js`,
  `stylesheets/chat.css`), using EAE's own controls.
- Covers all four kinds of data in the brief: demographics, social and
  productive uses, energy resources, power infrastructure.
- Guides new users (recipes, legend explanations) and speeds up returning users
  (one sentence instead of many clicks).

**Questions judges are likely to ask:**

| Question | Honest answer |
|---|---|
| Did you fine-tune the model? | Not yet. We used instructions, a worked example from real layers, a fixed answer format and checks. The 58 labelled questions are ready to start fine-tuning (for example LoRA on Qwen2.5) and `eval.js` measures whether it helps. |
| What if the AI is wrong? | Every action is checked: invented layers are dropped and values kept in range. All numbers and place names come from EAE, never from the AI. |
| Why is it slow sometimes? | The model runs on a laptop processor with no graphics card. Common questions skip the model and answer in under a second; a server with a graphics card would answer model questions in a few seconds. |
| Does it work for other countries? | Yes. The map sends the layer list for whichever country is open, and the labelled questions use roles, not Kenya-specific ids. We tested on Kenya. |
| What does it cost to run? | Nothing beyond the computer: no paid API, and it runs offline once the map data is loaded. |
| What about privacy? | Questions and map data stay on the machine running the model. |

**Backup plan:**

- If the model is slow or stuck, use the questions not marked (model) in
  sections 1–4 and 7; they work even if Window 1 is off.
- If the internet is slow, open the map and turn on the layers before you
  present, so the data is already loaded.
- Keep screenshots of each demo step in case the live demo fails.
- Practise once with all three windows running on the presentation laptop.

## Next steps

- Grow `data/intents.jsonl` with real user questions, especially French and
  Swahili, then fine-tune the model (for example LoRA on Qwen2.5) using the same
  `{ intent, reply, actions }` format, and compare with `eval.js`.
- Re-run the combined evaluation on all 58 questions and an LLM-only run.
- Add more action types (for example selecting a sub-geography or a dataset's
  categories) as the evaluation shows demand.
- Generate a written summary of the high-priority areas for the report.
