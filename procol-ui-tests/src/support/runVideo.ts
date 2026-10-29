import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { setFrameSink } from "./liveCursor.js";

/**
 * A VIDEO OF A RUN THAT FAILED — how the bug happened, to watch (Aanya, 29 Oct: "in the bug report,
 * we also want a column for artifacts for the images or the video links of where and how the bug
 * occurred").
 *
 * No second camera: the live view already takes a picture of the page every 800 ms and one at every
 * action (liveCursor.ts). Each of those frames of the main picture is written to
 * evidence/<run>/frames/ as it is taken. When the run passes, the frames are deleted. When it fails,
 * they become evidence/<run>/video.webm, made with the ffmpeg that Playwright installs for its own
 * videos.
 *  - Timing follows the run: each frame shows until the next was taken, in steps of 0.4 s. A wait longer
 *    than 3 s is cut to 3 s, so a run stuck for a minute plays in seconds (the video says so). A wait is
 *    also a run of near-identical pictures (the same screen with only a countdown ticking — same size
 *    within 1.5%): it is one still too, at most 3 s (29 Oct: a 3½-minute wait for a window to close made
 *    a 5-minute video).
 *  - A sign-in screen is never recorded: frames taken on /login (or a sign-in / one-time-code page)
 *    are dropped, so no phone number or one-time code is ever in a video. Recording starts after the
 *    run's own sign-in, the way its trace does.
 */

const TICK_MS = 400;
const LONGEST_MS = 3_000;
const LAST_MS = 2_000;
/** Pages whose pictures are never kept: sign-in and one-time-code screens. */
const SECRET_PAGE = /\/(login|log-in|signin|sign-in|otp|verify|auth)(\/|$|\?)/i;

/** Playwright's own ffmpeg (installed with its browsers), else one on PATH. */
function ffmpegPath(): string | null {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), "Library", "Caches", "ms-playwright"), join(homedir(), ".cache", "ms-playwright"), join(homedir(), "AppData", "Local", "ms-playwright")].filter(Boolean) as string[];
  const names = process.platform === "darwin" ? ["ffmpeg-mac"] : process.platform === "win32" ? ["ffmpeg-win64.exe"] : ["ffmpeg-linux"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => /^ffmpeg-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) for (const n of names) if (existsSync(join(root, d, n))) return join(root, d, n);
  }
  return process.platform === "win32" ? null : "ffmpeg";
}

export interface RunVideo {
  /** Keep (make the video) or drop the frames. The video's path, or null when none was made. */
  finish(keep: boolean): Promise<string | null>;
}

/** Start keeping the run's frames in `dir` (the run's evidence folder). */
export function startRunVideo(dir: string): RunVideo {
  const frames = join(dir, "frames");
  mkdirSync(frames, { recursive: true });
  const kept: { at: number; file: string }[] = [];
  let dropped = 0;
  let stopped = false;
  setFrameSink((page: Page, pane: "" | "side", jpeg: Buffer) => {
    if (stopped || pane) return; // the main picture only
    let url = "";
    try {
      url = page.url();
    } catch {
      return;
    }
    if (SECRET_PAGE.test(new URL(url, "http://x").pathname + "/")) {
      dropped++;
      return;
    }
    const file = join(frames, `${String(kept.length).padStart(5, "0")}.jpg`);
    try {
      writeFileSync(file, jpeg);
      kept.push({ at: Date.now(), file });
    } catch {
      /* a missing frame is a shorter video, never a failed run */
    }
  });
  return {
    async finish(keep: boolean): Promise<string | null> {
      stopped = true;
      setFrameSink(null);
      const out = join(dir, "video.webm");
      try {
        if (!keep || kept.length < 3) return null;
        const bin = ffmpegPath();
        if (!bin) return null;
        const made = await new Promise<boolean>((resolve) => {
          const ff = spawn(bin, ["-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(1000 / TICK_MS), "-i", "pipe:0",
            "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "800k", "-pix_fmt", "yuv420p", "-y", out], { stdio: ["pipe", "ignore", "pipe"] });
          let err = "";
          ff.stderr.on("data", (d) => (err += String(d)));
          ff.on("error", () => resolve(false));
          ff.on("close", (code) => {
            if (code !== 0) console.log(`[video] could not make the video: ${err.split("\n")[0].slice(0, 160)}`);
            resolve(code === 0);
          });
          ff.stdin.on("error", () => {});
          (async () => {
            let held = 0; // ms the current still has already been shown
            let lastSize = 0;
            for (let i = 0; i < kept.length; i++) {
              const buf = readFileSync(kept[i].file);
              const same = lastSize > 0 && Math.abs(buf.length - lastSize) / lastSize < 0.015;
              lastSize = buf.length;
              if (!same) held = 0;
              const gap = i + 1 < kept.length ? Math.max(TICK_MS, kept[i + 1].at - kept[i].at) : LAST_MS;
              const shown = Math.max(0, Math.min(gap, LONGEST_MS - held));
              held += shown;
              for (let t = 0; t < Math.round(shown / TICK_MS); t++) {
                if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
              }
            }
            ff.stdin.end();
          })().catch(() => ff.stdin.end());
        });
        if (made) console.log(`[video] kept a video of the run (${kept.length} pictures${dropped ? `; ${dropped} taken on a sign-in screen were left out` : ""}; long waits cut to ${LONGEST_MS / 1000} s)`);
        return made && existsSync(out) ? out : null;
      } finally {
        rmSync(frames, { recursive: true, force: true });
      }
    },
  };
}
