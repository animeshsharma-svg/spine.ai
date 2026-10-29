/**
 * THE EXPLORER'S NEXT MOVE, chosen by the platform's model.
 *
 * The model is the dashboard's (prototype/src/ai/llm.ts: Slingring, then Groq,
 * then Gemini), reached through the server that started this run
 * (POST /api/explore/decide). That keeps one set of keys, one fallback chain
 * and one spend counter, instead of a second copy of each in the browser
 * process. The healer's own Gemini key is not involved.
 *
 * The model only chooses; it never acts. Every answer is checked here (a ref
 * that is not on screen is refused), and explorer.ts checks a "done" against
 * the screen before believing it.
 */

export type ActionName = "click" | "dblclick" | "fill" | "select" | "press" | "goto" | "scroll" | "back" | "wait" | "ask" | "done" | "fail" | "stuck";

export interface Decision {
  action: ActionName;
  ref?: number;
  value?: string;
  /** one plain sentence: why this move, from the tester's side of the screen */
  why: string;
  /** ask / stuck: the question, and 2-4 short answers to offer */
  question?: string;
  options?: string[];
  /** done: the words on screen that show the goal is reached */
  proof?: string;
}

const ACTIONS = new Set<ActionName>(["click", "dblclick", "fill", "select", "press", "goto", "scroll", "back", "wait", "ask", "done", "fail", "stuck"]);

export const SYSTEM = [
  `You are the explorer inside spine.ai, the QA platform that tests Procol, a B2B procurement web app.`,
  `A tester asked for a journey that has no ready-made test steps. You complete it in a real browser,`,
  `one action at a time, the way a careful QA tester would. You are already signed in as the client's buyer.`,
  ``,
  `Each turn you get: the GOAL, what you did so far, what the tester has told you, and the SCREEN NOW —`,
  `its address, headings, messages, a numbered list of CONTROLS and the visible text. Choose ONE next action.`,
  ``,
  `How to work:`,
  `- Find the right module from the side menu or top navigation, open it, use the create/new button,`,
  `  fill what the form requires, save or submit, then check the result is on screen.`,
  `- Use only refs from the CURRENT controls list. Never invent a ref. Prefer controls not marked "(behind the dialog)".`,
  `- A dropdown (combobox) is a click to open it, then a click on the option, which appears in the list next turn.`,
  `  For a searchable dropdown, "fill" types the search text; then click the option.`,
  `- Clicking a dropdown that is already open CLOSES it. When the screen says an open list is still loading, use`,
  `  "wait" (it waits for the list); when it is open but empty, "fill" a few letters to search instead.`,
  `- A select-like field that, once clicked, only gives you an empty text box ("Typing goes to: … (empty) — no list`,
  `  is open") is search-as-you-type: "fill" 2-3 letters (or the name the case gives) and the options appear;`,
  `  then click one. Do not click the field again and do not decide it is empty before you have typed.`,
  `- Fill required fields with plausible test data yourself: quantity 1-10, price 100, a title like`,
  `  "spine.ai test" + a short number, the first vendor/item offered. Never ask the tester for ordinary test data.`,
  `- If your last action changed nothing, do not repeat it: try another way (another control, scroll, close a pop-up).`,
  `- In a spreadsheet-like grid a single click only selects a cell; a row usually opens with "dblclick", an`,
  `  action button or link in the row, or a ⋮ menu. A control named "link to /path" is an icon link to that page.`,
  `- To ACT on a record (create something from it, convert, edit, award), take it from the list tab of records`,
  `  that are still open — Open, Live, Pending, In Progress — never Completed, History, Closed, Rejected or Deleted`,
  `  unless the goal names that tab: a finished record no longer offers the action (a completed PR has no way to`,
  `  create an event). A list action that stays greyed out usually needs a row ticked first.`,
  `- To SELECT a row (so a toolbar action such as Purchase Items turns on), tick its box: it is listed as checkbox`,
  `  "select this row" with the row's words. Clicking or opening the row itself does not select it.`,
  `- Never go round in circles. If a way did not work twice, it will not work a third time: say "stuck".`,
  `- If a message on screen says something is required or wrong, deal with it.`,
  `- After a submit, publish, approve or send, the app's success message ("PO Submitted", "… has been submitted")`,
  `  means it went through, even while the page still shows the old status or the same button for a few seconds.`,
  `  Never do it a second time: "wait", then check the result (its status, or the record in its list).`,
  ``,
  `Ask the tester (action "ask") only when you truly cannot choose: a value only they know, two different paths`,
  `that would test different things (e.g. "use an existing PO or create a new one?"), or a goal you do not`,
  `understand. Never ask about signing in, URLs, OTPs or accounts. Give 2-4 short options.`,
  ``,
  `"done" only when the SCREEN NOW shows the goal is reached (e.g. the new record with its number, a success`,
  `message, the list you were asked to open). Put in "proof" 2-8 words copied EXACTLY, character for character,`,
  `from VISIBLE TEXT, a heading or a control's name, that show it (e.g. "PO-2231 created", "Purchase Orders").`,
  `Copy, never describe: "the list of purchase orders is visible" is a description and will be rejected.`,
  `A column heading, field label or button name is never proof that a value is there: for "check it shows PO`,
  `numbers", quote a PO number from that column, not "PO Number".`,
  `"fail" when you made the check the goal asks for and the app does NOT meet it: the column it asks about is`,
  `empty, a value is wrong, the message it expects never appears. Say what you saw in "why" and put in "proof"`,
  `words on the screen next to it (e.g. the column heading over the empty cells). Do not keep looking for a`,
  `way to make it pass: a failed check is a result.`,
  `"stuck" when the app gives no way forward: the feature is not there for this account, an error you cannot get`,
  `past, or you have tried the sensible ways. Say why in "why" in plain words, and give 2-4 options the tester`,
  `could pick to unblock you.`,
  ``,
  `Actions:`,
  `  click {ref}            dblclick {ref}          fill {ref, value}    select {ref, value}  (native select only)`,
  `  press {value: "Enter"|"Escape"|"Tab", ref?}    goto {value: "/path" in this app}`,
  `  scroll {value: "down"|"up", ref?}              back                 wait (the page is loading)`,
  `  ask {question, options}                        done {proof}         fail {why, proof}    stuck {why, options}`,
  ``,
  `"why" is ONE short plain sentence a non-technical tester understands, about what you are doing and why`,
  `(e.g. "Opening Purchase Orders to find the PO to invoice"). No refs, CSS or code in it.`,
  ``,
  `Reply with JSON only — no code fence, no text around it:`,
  `{"action":"click","ref":12,"value":null,"why":"…","question":null,"options":null,"proof":null}`,
].join("\n");

/** What the model is told each turn. */
export function turnPrompt(t: {
  goal: string;
  done: string[];
  told: string[];
  lastResult: string;
  route?: string;
  screen: string;
}): string {
  return [
    `GOAL: ${t.goal}`,
    "",
    t.told.length ? `WHAT THE TESTER HAS TOLD YOU:\n${t.told.map((x) => `- ${x}`).join("\n")}\n` : "",
    t.route ? `A ROUTE THAT REACHED THIS GOAL ON A PAST RUN (follow it where the screen still matches):\n${t.route}\n` : "",
    `WHAT YOU DID SO FAR:\n${t.done.length ? t.done.slice(-25).map((x, i, a) => `${t.done.length - a.length + i + 1}. ${x}`).join("\n") : "(nothing yet)"}`,
    "",
    `RESULT OF YOUR LAST ACTION: ${t.lastResult}`,
    "",
    `SCREEN NOW:\n${t.screen}`,
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** The model's JSON, read leniently; null when nothing usable came back. */
export function parseDecision(raw: string, refs: Set<number>): { decision: Decision | null; problem?: string } {
  const text = raw.replace(/```(?:json)?/gi, "");
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from < 0 || to <= from) return { decision: null, problem: "the answer was not JSON" };
  let j: any;
  try {
    j = JSON.parse(text.slice(from, to + 1));
  } catch {
    return { decision: null, problem: "the answer was not valid JSON" };
  }
  const action = String(j?.action ?? "").toLowerCase() as ActionName;
  if (!ACTIONS.has(action)) return { decision: null, problem: `"${j?.action}" is not one of the actions` };
  const ref = j.ref === null || j.ref === undefined || j.ref === "" ? undefined : Number(j.ref);
  const options = Array.isArray(j.options)
    ? j.options.map((o: unknown) => String(typeof o === "object" && o ? (o as any).label ?? "" : o ?? "").trim().slice(0, 120)).filter(Boolean).slice(0, 4)
    : undefined;
  const d: Decision = {
    action,
    ref: Number.isFinite(ref) ? ref : undefined,
    value: j.value === null || j.value === undefined ? undefined : String(j.value).slice(0, 500),
    why: String(j.why ?? j.thought ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
    question: j.question ? String(j.question).trim().slice(0, 400) : undefined,
    options,
    proof: j.proof ? String(j.proof).trim().slice(0, 200) : undefined,
  };
  const needsRef = action === "click" || action === "dblclick" || action === "fill" || action === "select";
  if (needsRef && d.ref === undefined) return { decision: null, problem: `"${action}" needs a ref from the controls list` };
  if (d.ref !== undefined && !refs.has(d.ref) && (needsRef || action === "press" || action === "scroll")) {
    return { decision: null, problem: `there is no control [${d.ref}] on this screen` };
  }
  if ((action === "fill" || action === "select") && d.value === undefined) return { decision: null, problem: `"${action}" needs a value` };
  if (action === "goto" && !d.value) return { decision: null, problem: `"goto" needs a path` };
  if (action === "ask" && !d.question) return { decision: null, problem: `"ask" needs a question` };
  if (action === "fail" && !d.why) return { decision: null, problem: `"fail" needs a why: what the check found` };
  return { decision: d };
}

/** One call to the server's model chain. Throws when the server or every provider failed. */
export async function callModel(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  const server = (process.env.SPINE_SERVER || "http://localhost:4300").replace(/\/$/, "");
  const res = await fetch(`${server}/api/explore/decide`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-spine-explore": process.env.UI_EXPLORE_KEY ?? "" },
    body: JSON.stringify({ runId: process.env.QA_RUN_ID ?? "", messages, tier: process.env.UI_EXPLORE_TIER ?? "fast" }),
    signal: AbortSignal.timeout(Number(process.env.UI_EXPLORE_MODEL_MS) || 120_000),
  });
  if (!res.ok) throw new Error(`the server's model answered ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j: any = await res.json();
  const text = String(j?.text ?? "");
  if (!text.trim()) throw new Error("no model could answer");
  return text;
}
