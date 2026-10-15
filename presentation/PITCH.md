# GridMind mid-point pitch

**Slot:** Thursday 15 October 2026, 15:30 to 15:45 CAT (The Gym, AskEAE). It runs online: 5 minutes of presentation, then 3 minutes of questions.
**Deck:** [GridMind-MidPoint-Review.pptx](GridMind-MidPoint-Review.pptx). Each slide's speaker notes hold the full script.

## Before the call (be ready by 15:20)

1. Start the three windows from [GridMind/agent/README.md](../GridMind/agent/README.md): the model (8081), the agent (8787) and the map (8080).
   On this laptop, use `.\start-llm.ps1 -LlamaDir C:\Users\USER\llama.cpp -Model C:\Users\USER\llama.cpp\models\qwen2.5-1.5b-instruct-q4_k_m.gguf`.
2. Open the Kenya map: http://localhost:8080/tool/a/?id=562ffd81-d326-41e4-9ba0-2dedb21130b2. Wait until "Fetching divisions…" is gone, then open the GridMind panel. The header should say `Open-source AI · qwen2.5-1.5b-instruct-q4_k_m`.
3. Ask each demo question once as a warm-up, so the data is loaded and the model is cached. Then reload the page so the map is empty.
4. Close other heavy programs (the model needs memory), mute notifications and turn on Do Not Disturb.
5. In the meeting, test screen sharing. **Share the whole screen, not one window**, so you can switch between PowerPoint and the browser without stopping the share.
6. Keep screenshots of each demo step open in a folder, as a backup.

## The 5 minutes

| Time | Slide | Message |
|---|---|---|
| 0:00 | 1 Title | GridMind: ask EAE in plain language, open source, built into the map |
| 0:20 | 2 Problem | 120 layers for Kenya alone; non-GIS users must choose layers, filters, importance and index |
| 0:50 | 3 One sentence | one question, and GridMind sets all of that with EAE's own controls |
| 1:15 | 4 Three jobs | builds priority maps, names real places, explains the map; all four datasets in the brief |
| 1:35 | 5 How it works | fast rules or the open-source AI, then safety checks, then EAE draws the map |
| 2:00 | 6 **Live demo** | switch to the browser and follow the 5 cues on the slide |
| 4:15 | 7 Results | 94.2% correct actions, 0 invented layers, 58 labelled questions; honest limits |
| 4:40 | 8 Next steps | fine-tuning, more French and Swahili, report summary, faster server; "Questions?" |

**Demo rule:** cues 1 to 3 never need the AI model and answer in under a second. Cues 4 and 5 take 20 to 60 seconds. If you are past 3:30 when you reach cue 4, skip to the results slide.

**If the model won't start** (for example, if the antivirus removes `llama-server.exe` again): run the agent anyway. The panel shows "Guided mode", and cues 1 to 3 still work. Say that the AI model handles cues 4 and 5, and show their screenshots.

## Questions judges are likely to ask

| Question | Answer |
|---|---|
| Did you fine-tune the model? | Not yet. We use instructions, a worked example from the real layers, a fixed answer format and checks. The 58 labelled questions are ready for fine-tuning (LoRA on Qwen2.5), and `eval.js` measures whether it helps. |
| What if the AI is wrong? | Every action is checked: invented layers are dropped and values are kept in range. Place names and numbers always come from EAE's own calculation, never from the AI. |
| Why is it slow sometimes? | The model runs on a laptop processor with no graphics card. Common questions skip the model and answer in under a second. |
| Does it work for other countries? | Yes. The map sends the layer list of whichever country is open, and the test questions use roles, not Kenya-specific ids. We tested on Kenya. |
| How does it help with reports? | It can open EAE's report export ("Export this analysis as a report"). Writing a summary of the high-priority areas into the report is our next step. |
| What does it cost? Is it private? | No paid API. It runs offline once the map data is loaded, and questions stay on the machine running the model. |
