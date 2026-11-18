/**
 * Multi-entity vendor emails — the run (test-cases/Multi_Entity_Email_Testing_Guide.md).
 *   npx tsx scripts/men-run.ts smoke          build P1101 / P4201 / P4501 / unmapped (LOC-0001) / manual RFQs, read every email
 *   npx tsx scripts/men-run.ts event <plant|manual> <tag>   one published RFQ and its emails
 *   npx tsx scripts/men-run.ts action <plant|manual> <invite|counter|surrogate|award|revise|auction|withdraw>   one email's action
 * Each email: .eml saved, Mailpit full-size screenshot, every name compared character by character with the PRD
 * table. Ledger: data/evidence/multi-entity/results.json (one record per event and per email).
 */
import "dotenv/config";
import { config } from "dotenv"; config({ path: "../procol-ui-tests/.env" });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { openClientContext } from "../src/executor.js";
import { withSettings } from "../src/checks/companySettings.js";
import { MAILPIT, MEN_COMPANY, menVendors, menUiPlan, mailSearch, buildMenEvent, checkMail, closeDb, expectedName, fromPrOf, mailRaw, prLinesOfPlant, sentSubjects, waitForMails } from "../src/checks/menLib.js";

const OUT = "data/evidence/multi-entity";
const LEDGER = `${OUT}/results.json`;
mkdirSync(`${OUT}/mails`, { recursive: true });
mkdirSync(`${OUT}/shots`, { recursive: true });
const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { events: [], mails: [] };
// several runs write the ledger at once (a batch, the watcher, a remind-again): merge with what is on disk, mine wins per record
const keyE = (e: any) => `${e.tag}|${e.eventGroupUuid ?? e.at}`;
const keyM = (m: any) => `${m.id}|${m.tag}`;
const save = () => {
  const disk: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { events: [], mails: [] };
  const merge = (a: any[], b: any[], k: (x: any) => string) => { const m = new Map(a.map((x) => [k(x), x])); for (const x of b) m.set(k(x), x); return [...m.values()]; };
  ledger.events = merge(disk.events ?? [], ledger.events, keyE);
  ledger.mails = merge(disk.mails ?? [], ledger.mails, keyM);
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
};

async function shotMail(id: string, name: string): Promise<string> {
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`${MAILPIT}/view/${id}`, { waitUntil: "networkidle", timeout: 60_000 });
    await p.waitForTimeout(1500);
    const f = `${OUT}/shots/${name}.png`;
    await p.screenshot({ path: f, fullPage: true });
    return f;
  } finally {
    await b.close();
  }
}

/** What one vendor email needs: the journey features, where it stops, and the subject that marks the email. */
const ACTIONS: Record<string, { features: string[]; until: string; subject: RegExp; kind?: string; auction?: boolean; stageSeconds?: number; startDelaySec?: number; after?: "withdraw" | "remind" | "amend" | "extend" | "reschedule" }> = {
  invite: { features: [], until: "read_back", subject: /./ },
  counter: { features: ["bids.counter_offer"], until: "counter_offer", subject: /counter offer/i },
  surrogate: { features: ["bids.surrogate"], until: "surrogate_rfq", subject: /on your behalf/i },
  award: { features: ["award.submit"], until: "award_submit", subject: /congratulations|selected|award/i, stageSeconds: 240 },
  revise: { features: ["events.versioning"], until: "version", subject: /revised/i },
  auction: { features: [], until: "read_back", subject: /auction/i, auction: true },
  withdraw: { features: [], until: "read_back", subject: /withdrawn/i, after: "withdraw" },
  remind: { features: [], until: "read_back", subject: /remind/i, after: "remind" },
  "remind-counter": { features: ["bids.counter_offer"], until: "counter_offer", subject: /counter offer/i, after: "remind" },
  amend: { features: [], until: "read_back", subject: /revised/i, after: "amend" },
  extend: { features: [], until: "read_back", subject: /./, after: "extend" },
  aboutend: { features: [], until: "read_back", subject: /about to end/i, stageSeconds: 600 },
  // 2 h: the mailer picks "Auction is Scheduled" vs "now live" when it SENDS, and UAT sends ~30 min late (16 Nov)
  scheduled: { features: [], until: "read_back", subject: /scheduled/i, auction: true, startDelaySec: 2 * 3600 },
  reschedule: { features: [], until: "read_back", subject: /rescheduled/i, auction: true, startDelaySec: 30 * 60, after: "reschedule" },
  twostage: { features: [], until: "read_back", subject: /./, kind: "events.rfp_rfq" },
};

async function oneEvent(client: any, v: any[], plant: string, tag: string, action = "invite") {
  const act = ACTIONS[action];
  if (!act) return console.log(`✗ unknown action ${action}`);
  let fromPr: any;
  let prInfo: any = {};
  // plant spec: one plant, "manual" (no PR), or a list in line order — "4301,1101" (two PRs), "manual,4201" (a
  // hand-added line first). Every PR line gives 5 units, so a PR line serves several events.
  const parts = plant.split(",");
  if (!(parts.length === 1 && parts[0] === "manual")) {
    const lines: any[] = [];
    for (const part of parts) {
      if (part === "manual") {
        const cat = client.ctx.catalog;
        lines.push({ manual: true, uuid: "", productUuid: cat.productUuid, qualityUuid: cat.productQualityUuid, unit: "KG", qty: 5, name: "hand-added line", plant: "(none)" });
        continue;
      }
      const many = part.match(/^(\w+)\*(\d+)$/);
      if (many) {
        // one PR with at least N open lines of this plant, all N on the RFQ (MEN-PRF-010)
        const all = await prLinesOfPlant(many[1], { limit: 400 });
        const byPr = new Map<number, number[]>();
        for (const l of all) byPr.set(l.prId, [...(byPr.get(l.prId) ?? []), l.lineId]);
        const best = [...byPr.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        if (!best || best[1].length < Number(many[2])) return console.log(`✗ ${tag}: no PR with ${many[2]} open lines of plant ${many[1]}`);
        const f = await fromPrOf(client.ctx.buyerApi, best[0], best[1].slice(0, Number(many[2])), { units: 5 });
        if ("why" in f) return console.log(`✗ ${tag}: ${f.why}`);
        lines.push(...f.lines);
        continue;
      }
      const ls = await prLinesOfPlant(part, { limit: 5 });
      // a small line this run already used may still read as open for a moment after the publish (16 Nov, PRF-003):
      // never reuse a line of 5 units or fewer; the 100-unit lines are shared on purpose
      const used = new Set<number>(ledger.events.flatMap((e: any) => e.lineDbIds ?? []));
      const pick = ls.find((l) => !lines.some((x) => x.lineDbId === l.lineId) && !(l.q <= 5 && used.has(l.lineId)));
      if (!pick) return console.log(`✗ ${tag}: no open PR line of plant ${part}`);
      const f = await fromPrOf(client.ctx.buyerApi, pick.prId, [pick.lineId], { units: 5 });
      if ("why" in f) return console.log(`✗ ${tag}: ${f.why}`);
      lines.push({ ...f.lines[0], lineDbId: pick.lineId });
    }
    const firstPr = lines.find((l) => !l.manual);
    fromPr = { prUuid: firstPr?.prUuid, prNo: firstPr?.prNo, lines };
    prInfo = { prNo: lines.map((l) => (l.manual ? "hand-added" : `${l.prNo} line ${l.itemNo}`)).join(" + "), plantRead: lines.map((l) => l.plant).join(" + "), prId: undefined };
  }
  // the name comes from line item 1: its plant, or "Gulbrandsen" when line 1 has no PR (PRD)
  const first = parts[0].replace(/\*\d+$/, "");
  const expected = expectedName(first === "manual" ? null : first);
  console.log(`▶ ${tag}: ${plant === "manual" ? "RFQ made by hand (no PR)" : `${prInfo.prNo}, plant ${prInfo.plantRead}`} → the vendor must see "${expected}"`);
  const ev = await buildMenEvent(client, { fromPr, alsoInvite: v.filter((x) => x.email !== client.ctx.vendor?.email).map((x) => x.vendorCompanyUuid), tag, features: act.features, until: act.until, auction: act.auction, stageSeconds: act.stageSeconds, startDelaySec: act.startDelaySec, kind: act.kind, onLine: (l) => /✗|fail|error/i.test(l) && console.log("   ", l.slice(0, 200)) });
  if (ev.ok && act.after === "withdraw") {
    const w = await client.ctx.buyerApi.attempt("PATCH", `/event_groups/${encodeURIComponent(ev.eventGroupUuid!)}`, { body: { status: "withdrawn", withdraw_remark: { remarks: "QA_Platform multi-entity email test — withdrawn by the run", attachments: [] } } });
    console.log(`  withdrew the project: HTTP ${w.status}`);
  }
  const afterNote: string[] = [];
  if (ev.ok && act.after === "remind") await sendReminder(client, v, ev.eventGroupUuid!, action!, afterNote);
  if (ev.ok && act.after === "amend") {
    const { amendEvent } = await import("../src/ui/uiSetup.js");
    const a = await amendEvent(client.ctx.buyerApi, ev.eventGroupUuid!, String(ev.title ?? `MEN ${tag}`), v.map((x) => x.vendorCompanyUuid), (l) => afterNote.push(l));
    afterNote.push(`new version published: ${a.published}${a.why ? ` (${a.why})` : ""}`);
  }
  if (ev.ok && (act.after === "extend" || act.after === "reschedule")) {
    const steps = act.after === "extend"
      ? [{ step: "open_prepared", args: { screen: "summary" } }, { step: "extend_time", args: { which: "submission", option: "preset", preset: "30 minutes" } }]
      : [{ step: "open_prepared", args: { screen: "summary" } }, { step: "reschedule_event", args: { start: "+2h" } }];
    const r = await menUiPlan({ eventGroupUuid: ev.eventGroupUuid!, made: ev.made, title: ev.title }, act.after === "extend" ? "live" : "upcoming", steps, (l) => console.log("    ", l.slice(0, 200)));
    afterNote.push(`browser: ${r.map((x) => `${x.step} ${x.status}${x.status !== "ok" ? ` (${x.detail})` : ""}`).join(" → ") || "no result"}`);
  }
  for (const n of afterNote) console.log("  ·", n.slice(0, 300));
  const rec = { tag, plant, expected, action, afterNote, ...prInfo, ...ev, lineDbIds: (fromPr?.lines ?? []).map((l: any) => l.lineDbId).filter(Boolean), at: new Date().toISOString() };
  ledger.events.push(rec);
  save();
  if (!ev.ok || !ev.rfx) return console.log(`✗ ${tag}: event not built — ${ev.why ?? "no RFX number read back"}`);
  if (process.argv.includes("--nowait")) return console.log(`  published ${ev.rfx} (${ev.eventGroupUuid}) — emails are kept by the watcher`);
  console.log(`  published ${ev.rfx} (${ev.eventGroupUuid}); waiting for V1's emails…`);
  if (action === "award") console.log(`  approve own steps: ${(await approveOwn(client, ev.rfx)).join(", ") || "none pending"}`);
  let hits = action === "invite" || action === "twostage" ? await waitForMails(ev.rfx, v[0].email, { ms: 45 * 60_000, atLeast: 2 }) : await waitForMails(ev.rfx, v[0].email, { ms: act.startDelaySec ? (act.startDelaySec + 2400) * 1000 : act.stageSeconds && act.stageSeconds < 3600 ? (act.stageSeconds + 2400) * 1000 : 45 * 60_000, subject: act.subject });
  // an action can send more than one vendor email (a withdrawal sends "RFQ has been withdrawn" AND "Project Withdrawn"):
  // a minute more, then keep every email of this event that is not the publish-time pair
  if (action !== "invite" && action !== "twostage" && hits.length) {
    await new Promise((r) => setTimeout(r, 60_000));
    hits = (await waitForMails(ev.rfx, v[0].email, { ms: 15_000 })).filter((h) => !/project invitation|is now live/i.test(h.subject) || act.auction);
  }
  if (!hits.length) console.log(`  ✗ no email to V1 about ${ev.rfx} within 10 minutes`);
  for (const h of hits) {
    const c = await checkMail(h.id, expected);
    const base = `${tag}-${ev.rfx}-${h.id.slice(0, 8)}`;
    writeFileSync(`${OUT}/mails/${base}.eml`, await mailRaw(h.id));
    const shot = await shotMail(h.id, base);
    ledger.mails.push({ tag, rfx: ev.rfx, plant, expected, ...c, eml: `${OUT}/mails/${base}.eml`, shot, at: new Date().toISOString() });
    save();
    console.log(`  ${c.verdict === "match" ? "✓" : c.verdict === "no-name" ? "·" : "✗"} "${c.subject}" — subject ${JSON.stringify(c.places.subject)} preview ${JSON.stringify(c.places.preview)} body ${JSON.stringify(c.places.body)}${c.wrong.length ? ` WRONG: ${JSON.stringify(c.wrong)}` : ""}`);
  }
}

/**
 * Approve the award's pending steps where THIS buyer is the approver (my_approval_required) — never anyone else's.
 * Gulbrandsen's proposal flow names the run's own buyer on both steps (read 13 Nov), so the award can finish.
 */
async function approveOwn(client: any, rfx: string): Promise<string[]> {
  const done: string[] = [];
  for (let round = 0; round < 4; round++) {
    await new Promise((r) => setTimeout(r, 4000));
    // the list is paged and earlier test awards stay pending in it: look through the first pages for this RFX
    const reqs: any[] = [];
    for (let page = 1; page <= 6; page++) {
      const pend = await client.ctx.buyerApi.attempt("GET", `/approval_workflow/approval_requests?view_type=approver&page=${page}`);
      const d: any[] = pend.data?.approvals?.data ?? [];
      reqs.push(...d);
      if (!d.length || d.some((r) => r.ref_uuid === rfx)) break;
    }
    const req = reqs.find((r) => r.ref_uuid === rfx && r.status === "pending");
    const ap = req?.approvers?.find((a: any) => a.my_approval_required);
    if (!ap) break;
    const rr = await client.ctx.buyerApi.attempt("POST", "/approval_workflow/approval_requests/resolve_approval", { body: { approver_uuid: ap.uuid, resolution: "accepted", remarks: "QA_Platform multi-entity email test — approved by the run's own buyer", attachments: [] } });
    done.push(`HTTP ${rr.status}`);
  }
  return done;
}

async function finishAward(client: any, v: any[], rfx: string, plant: string) {
  const expected = expectedName(plant === "manual" ? null : plant);
  const a = await approveOwn(client, rfx);
  console.log(`▶ approve ${rfx}: ${a.length ? a.join(", ") : "nothing pending on this buyer"} — waiting for V1's award email…`);
  const hits = await waitForMails(rfx, v[0].email, { ms: 45 * 60_000, subject: /congratulations|selected|award/i });
  if (!hits.length) console.log(`  ✗ no award email to V1 about ${rfx} within 10 minutes`);
  for (const h of hits) await keepMail(h, `award-${plant}`, rfx, plant, expected);
}

async function keepMail(h: any, tag: string, rfx: string, plant: string, expected: string) {
  const c = await checkMail(h.id, expected);
  const base = `${tag}-${rfx}-${h.id.slice(0, 8)}`;
  writeFileSync(`${OUT}/mails/${base}.eml`, await mailRaw(h.id));
  const shot = await shotMail(h.id, base);
  ledger.mails.push({ tag, rfx, plant, expected, ...c, eml: `${OUT}/mails/${base}.eml`, shot, at: new Date().toISOString() });
  save();
  console.log(`  ${c.verdict === "match" ? "✓" : c.verdict === "no-name" ? "·" : "✗"} "${c.subject}" — subject ${JSON.stringify(c.places.subject)} preview ${JSON.stringify(c.places.preview)} body ${JSON.stringify(c.places.body)}${c.wrong.length ? ` WRONG: ${JSON.stringify(c.wrong)}` : ""}`);
}

/** The exact email a setting window waits for (reminder subjects from ReminderWorker#get_subject; the counter email itself also says "Counter Offer"). */
const HOLD: Record<string, RegExp> = {
  remind: /\[Reminder\] Submit Your Offer/i,
  "remind-counter": /^\[[^\]]+\] \| Action required: Counter Offer/i,
  scheduled: /scheduled/i,
  reschedule: /rescheduled/i,
};

/** The buyer's "Send Reminder" on a published project: the kinds the app offers, then the one for V1 (dashboard bulkReminderDrawer). */
async function sendReminder(client: any, v: Array<{ email: string }>, eventGroupUuid: string, action: string, afterNote: string[]) {
  // the buyer's "Send Reminder": the kinds the app offers for this project, then the one for V1 (dashboard bulkReminderDrawer)
  const g = await client.ctx.buyerApi.attempt("GET", `/reminders/${encodeURIComponent(eventGroupUuid)}?resource_type=event_group`);
  // the answer is keyed by kind: {offer_submissions: {recipients:[…]}, counter_offers, cost_break_down_submissions, …} (read 16 Nov)
  const cards: any[] = Object.entries(g.data ?? {}).filter(([, v]) => v && typeof v === "object").map(([k, v]: [string, any]) => ({ reminder_type: k, reminder_data: v }));
  const kinds = cards.map((c: any) => c.reminder_type);
  afterNote.push(`reminder kinds offered: ${JSON.stringify(kinds)}`);
  const want = action === "remind-counter" ? /^counter_offers$/ : /^offer_submissions$/;
  const card = cards.find((c: any) => want.test(c.reminder_type));
  const recips: any[] = card?.reminder_data?.recipients ?? card?.recipients ?? [];
  const mine = recips.filter((r: any) => JSON.stringify(r).toLowerCase().includes(v[0].email.toLowerCase()) || JSON.stringify(r).includes("QA_Platform Vendor 1"));
  const pickR = mine.length ? mine : recips;
  const reminders = Object.fromEntries(pickR.filter((r: any) => Array.isArray(r.uuids)).map((r: any) => [r.recipient_uuid, r.uuids]));
  if (!card) afterNote.push(`no reminder kind matching ${want} — the raw answer: ${JSON.stringify(g.data).slice(0, 300)}`);
  else {
    const sr = await client.ctx.buyerApi.attempt("POST", `/reminders/${encodeURIComponent(eventGroupUuid)}/send_reminder`, { body: { resource_type: "event_group", reminder_type: card.reminder_type, reminders } });
    afterNote.push(`sent "${card.reminder_type}" to ${Object.keys(reminders).length} recipient(s): HTTP ${sr.status} ${sr.errorMessage ?? ""}`);
  }
}

const [cmd, a1, a2] = process.argv.slice(2);
const client: any = await openClientContext(MEN_COMPANY);
try {
  const v = await menVendors();
  if (v.length < 2) throw new Error("QA vendors V1/V2 are not set up (scripts/men-setup.ts --vendors)");
  console.log(`QA vendors: ${v.map((x) => `${x.name} <${x.email}>`).join(", ")}; the journey signs in as ${client.ctx.vendor?.name ?? "?"}`);
  if (cmd === "smoke") {
    for (const [plant, tag] of [["1101", "P1101"], ["4201", "P4201"], ["4501", "P4501"], ["LOC-0001", "PUNMAPPED"], ["manual", "MANUAL"]] as const) await oneEvent(client, v, plant, tag);
  } else if (cmd === "event") await oneEvent(client, v, a1, a2 ?? `P${a1}`);
  else if (cmd === "action") await oneEvent(client, v, a1, `${a2}-${a1}`, a2);
  else if (cmd === "approve") await finishAward(client, v, a1, a2);
  else if (cmd === "remind-again") {
    // a reminder on a project built earlier (by RFX number from the ledger): remind-again <RFX-n> remind|remind-counter
    const e = [...ledger.events].reverse().find((x: any) => x.rfx === a1);
    if (!e) throw new Error(`${a1} is not in the ledger`);
    const notes: string[] = [];
    await sendReminder(client, v, e.eventGroupUuid, a2 ?? "remind", notes);
    for (const n of notes) console.log("  ·", n.slice(0, 300));
    e.afterNote = [...(e.afterNote ?? []), ...notes.map((n) => `${new Date().toISOString().slice(11, 16)}Z again: ${n}`)];
    save();
  }
  else if (cmd === "hide-on") {
    // module 5, short window: the projects are built beforehand with the setting OFF and their invitations already sent;
    // ON → the fast-queue emails (manual reminders, Event Revised) → wait until UAT has SENT each → OFF.
    // hide-on RFX-n:remind|remind-counter|amend …   (SETTINGS_ALLOWED_COMPANIES=50169)
    const list = process.argv.slice(3).filter((x) => x.includes(":")).map((x) => x.split(":"));
    const out = await withSettings(MEN_COMPANY, [{ key: "hide_company_name_in_emails", value: true, why: "module 5 of the multi-entity email cases (short window)" }], "MEN-HID", (l) => console.log("  ·", l), async () => {
      const done: Array<{ e: any; re: RegExp; what: string }> = [];
      for (const [rfx, what] of list) {
        const e = [...ledger.events].reverse().find((x: any) => x.rfx === rfx);
        if (!e) { console.log(`  ✗ ${rfx} is not in the ledger`); continue; }
        const notes: string[] = [];
        if (what === "amend") {
          const { amendEvent } = await import("../src/ui/uiSetup.js");
          const a = await amendEvent(client.ctx.buyerApi, e.eventGroupUuid, String(e.title ?? rfx), v.map((x) => x.vendorCompanyUuid), (l) => notes.push(l));
          notes.push(`new version published: ${a.published}${a.why ? ` (${a.why})` : ""}`);
        } else await sendReminder(client, v, e.eventGroupUuid, what, notes);
        for (const n of notes) console.log(`  · ${rfx} ${what}: ${n.slice(0, 250)}`);
        e.hideOn = [...(e.hideOn ?? []), { what, at: new Date().toISOString(), notes }];
        save();
        done.push({ e, what, re: what === "amend" ? /revised/i : HOLD[what] });
      }
      const until = Date.now() + 30 * 60_000;
      for (;;) {
        const left: string[] = [];
        for (const d of done) if (!(await sentSubjects(d.e.rfx, v[0].email, d.e.title)).some((s) => d.re.test(s))) left.push(`${d.e.rfx} ${d.what}`);
        if (!left.length) { console.log("  · every email has been sent — switching the setting back"); break; }
        if (Date.now() > until) { console.log(`  · 30 min passed, still not sent: ${left.join(", ")} — switching back anyway`); break; }
        await new Promise((r) => setTimeout(r, 20_000));
      }
      return true;
    });
    console.log("refused" in out ? `✗ the setting could not be switched: ${out.refused}` : `setting changes: ${JSON.stringify(out.changed)} — switched back afterwards`);
  }
  else if (cmd === "approve-only") console.log(`approve ${a1}: ${(await approveOwn(client, a1)).join(", ") || "nothing pending on this buyer"}`);
  else if (cmd === "watch") {
    // Mailpit keeps ~500 emails and UAT sent ~1,600 in 30 min on 16 Nov: watch V1's inbox every 10 s and keep each new
    // email at once (.eml, screenshot, every name found). Its own log (watch.json) — judged later against its event.
    const WATCH = `${OUT}/watch.json`;
    const seenW: any = existsSync(WATCH) ? JSON.parse(readFileSync(WATCH, "utf8")) : { mails: [] };
    const have = new Set<string>([...seenW.mails.map((m: any) => m.id), ...ledger.mails.map((m: any) => m.id)]);
    const until = Date.now() + Number(a1 ?? 8) * 3600_000;
    const { namesIn, dataNamesIn, mailMessage } = await import("../src/checks/menLib.js");
    console.log(`watching ${v[0].email} until ${new Date(until).toISOString()} (stop: touch ${OUT}/watch.stop)`);
    while (Date.now() < until && !existsSync(`${OUT}/watch.stop`)) {
      const hits = await mailSearch(`to:${v[0].email}`).catch(() => [] as any[]);
      for (const h of hits.filter((x: any) => !have.has(x.id))) {
        have.add(h.id);
        try {
          const m = await mailMessage(h.id);
          const body = (m.html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim() || m.text;
          const rfx = (m.subject.match(/\bRFX-\d+\b/) ?? body.match(/\bRFX-\d+\b/))?.[0] ?? "";
          const base = `watch-${rfx || "none"}-${h.id.slice(0, 8)}`;
          writeFileSync(`${OUT}/mails/${base}.eml`, await mailRaw(h.id));
          const shot = await shotMail(h.id, base);
          seenW.mails.push({ id: h.id, rfx, subject: m.subject, to: m.to, from: m.from, places: { subject: namesIn(m.subject), preview: namesIn(h.snippet), body: namesIn(body) }, other: [...new Set([...dataNamesIn(m.subject), ...dataNamesIn(body)])], preview: h.snippet, created: h.created, eml: `${OUT}/mails/${base}.eml`, shot, at: new Date().toISOString() });
          writeFileSync(WATCH, JSON.stringify(seenW, null, 1));
          console.log(`  kept ${rfx || "?"} "${m.subject}" — names ${JSON.stringify(namesIn(m.subject + " | " + body))}`);
        } catch (e) {
          console.log(`  ✗ ${h.id}: ${String(e).slice(0, 120)}`);
        }
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  else if (cmd === "sweep") {
    // emails that arrived after their event's wait ended (UAT's mail queue ran late on 16 Nov): keep every email to V1
    // about the run's events that is not saved yet, judged against that event's expected name
    const have = new Set(ledger.mails.map((m: any) => m.id));
    for (const e of ledger.events.filter((x: any) => x.rfx)) {
      const hits = (await mailSearch(`to:${v[0].email} ${e.rfx}`).catch(() => [])).filter((h: any) => (h.subject.includes(`${e.rfx} `) || h.subject.endsWith(e.rfx)) && !have.has(h.id));
      for (const h of hits) { await keepMail(h, `sweep-${e.tag}`, e.rfx, e.plant, e.expected); have.add(h.id); }
    }
  }
  else if (cmd === "recheck") {
    // read the emails of an RFX again with the current rules and replace their records
    for (const m of ledger.mails.filter((x: any) => x.rfx === a1)) {
      const c = await checkMail(m.id, m.expected).catch((e) => ({ error: String(e) }) as any);
      if (c.error) { console.log(`  ${m.id}: ${c.error}`); continue; }
      Object.assign(m, c, { rechecked: new Date().toISOString() });
      console.log(`  ${c.verdict} "${c.subject}" names ${JSON.stringify(c.places)} other data ${JSON.stringify(c.other)}`);
    }
    save();
  }
  else if (cmd === "hide") {
    // module 5: 'Hide company name in emails' ON for these actions only, then back (approved by the tester 13 Nov;
    // SETTINGS_ALLOWED_COMPANIES=50169 set for this run). withSettings confirms the switch and restores it.
    const list = process.argv.slice(3).map((x) => x.split(":")); // plant:action
    const out = await withSettings(MEN_COMPANY, [{ key: "hide_company_name_in_emails", value: true, why: "module 5 of the multi-entity email cases" }], "MEN-HID", (l) => console.log("  ·", l), async () => {
      for (const [plant, action] of list) await oneEvent(client, v, plant, `hide-${action}-${plant}`, action);
      if (process.argv.includes("--nowait")) {
        // keep the setting ON until UAT has actually sent each project's email (the queue runs behind), ceiling 90 min
        const built = list.map(([plant, action]) => ({ action, e: [...ledger.events].reverse().find((x: any) => x.tag === `hide-${action}-${plant}` && x.rfx) })).filter((x) => x.e);
        const until = Date.now() + 90 * 60_000;
        for (;;) {
          const left: string[] = [];
          for (const { action, e } of built) if (!(await sentSubjects(e.rfx, v[0].email, e.title)).some((s) => (HOLD[action] ?? ACTIONS[action].subject).test(s))) left.push(`${e.rfx} ${action}`);
          if (!left.length) { console.log("  · every project's email has been sent — switching the setting back"); break; }
          if (Date.now() > until) { console.log(`  · 90 min passed, still not sent: ${left.join(", ")} — switching back anyway (these cases: Couldn't tell)`); break; }
          await new Promise((r) => setTimeout(r, 60_000));
        }
      }
      return true;
    });
    console.log("refused" in out ? `✗ the setting could not be switched: ${out.refused}` : `setting changes: ${JSON.stringify(out.changed)} — switched back afterwards`);
  }
  else if (cmd === "grab") {
    // keep every email to V1 about an RFX whose subject matches (one already sent): grab <RFX> <plant> <subject words>
    const hits = await waitForMails(a1, v[0].email, { ms: 60_000, subject: new RegExp(process.argv[5] ?? ".", "i") });
    for (const h of hits) await keepMail(h, `grab-${a2}`, a1, a2, expectedName(a2 === "manual" ? null : a2));
    if (!hits.length) console.log(`  ✗ Mailpit no longer has (or never had) "${process.argv[5]}" for ${a1}`);
  }
  else console.log("usage: men-run.ts smoke | event <plant|manual> <tag>");
} finally {
  await client.dispose?.().catch(() => {});
  await closeDb();
}
process.exit(0);
