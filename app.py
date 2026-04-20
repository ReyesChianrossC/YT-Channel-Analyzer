"""
YT Channel Analyzer — Flask Backend
Ported from the legacy Tkinter version.
"""

import json
import os
import random
import time
import threading
import queue
from datetime import datetime
from typing import List, Dict, Optional

from flask import Flask, render_template, request, Response, jsonify, stream_with_context

app = Flask(__name__)

# ─── Global state (one analysis at a time) ───────────────────────────────────
class AnalysisState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.running = False
        self.stop_requested = False
        self.current_videos: List[Dict] = []
        self.current_channel_url = ""
        self.request_count = 0
        self.last_request_time = 0.0
        self.adaptive_delay = 1.0
        self.success_rate = 1.0
        self.min_views = 500_000
        self.event_queue: queue.Queue = queue.Queue()
        self.thread: Optional[threading.Thread] = None


state = AnalysisState()


# ─── Helpers ─────────────────────────────────────────────────────────────────
def format_duration(seconds) -> str:
    if not seconds:
        return "Unknown"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"


def format_views(views: int) -> str:
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M"
    elif views >= 1_000:
        return f"{views / 1_000:.1f}K"
    return str(views)


def push_event(event_type: str, data: dict):
    """Push an SSE event into the queue."""
    state.event_queue.put({"type": event_type, "data": data})


def adaptive_rate_limit(success: bool = True):
    """Intelligent adaptive rate limiting (same logic as legacy app)."""
    current_time = time.time()

    if success:
        state.success_rate = min(1.0, state.success_rate + 0.05)
        state.adaptive_delay = max(0.5, state.adaptive_delay * 0.95)
    else:
        state.success_rate = max(0.1, state.success_rate - 0.1)
        state.adaptive_delay = min(5.0, state.adaptive_delay * 1.5)

    time_since_last = current_time - state.last_request_time
    if time_since_last < state.adaptive_delay:
        delay = state.adaptive_delay - time_since_last + random.uniform(0, 0.5)
        time.sleep(delay)

    state.last_request_time = time.time()
    state.request_count += 1

    if state.request_count % 10 == 0:
        time.sleep(random.uniform(1, 2))


# ─── Core analysis (runs in background thread) ───────────────────────────────
def run_analysis(url: str, min_views: int):
    try:
        import yt_dlp
    except ImportError:
        push_event("error", {"message": "yt-dlp not installed. Run: pip install yt-dlp"})
        state.running = False
        return

    state.current_videos = []
    state.current_channel_url = url

    push_event("progress", {"percent": 5, "text": "Scanning channel…", "phase": "Phase 1/3"})

    # ── Phase 1: fast flat scan ──
    ydl_opts_fast = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "ignoreerrors": True,
        "playlist_items": "1-1000",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts_fast) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info or "entries" not in info:
            push_event("error", {"message": "No videos found in this channel."})
            state.running = False
            return

        video_ids = [e["id"] for e in info["entries"] if e and e.get("id")]
        total = len(video_ids)

        if total == 0:
            push_event("error", {"message": "No valid videos found."})
            state.running = False
            return

        push_event("progress", {
            "percent": 15,
            "text": f"Found {total} videos",
            "phase": "Phase 2/3",
            "total": total,
        })

    except Exception as e:
        push_event("error", {"message": f"Channel scan failed: {e}"})
        state.running = False
        return

    # ── Phase 2: detailed metadata per video ──
    ydl_opts_detail = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "ignoreerrors": True,
    }

    qualifying = 0
    errors = 0
    processed = 0

    start_time = time.time()

    with yt_dlp.YoutubeDL(ydl_opts_detail) as ydl_d:
        for i, vid_id in enumerate(video_ids):
            if state.stop_requested:
                push_event("stopped", {"processed": processed, "total": total})
                break

            try:
                adaptive_rate_limit(success=True)

                pct = 15 + (i / total) * 75
                speed_text = f"Delay: {state.adaptive_delay:.1f}s | Success: {state.success_rate:.0%}"

                elapsed = time.time() - start_time
                avg_per_video = elapsed / (i + 1) if i > 0 else 0
                eta_secs = avg_per_video * (total - i - 1)
                eta_str = f"{int(eta_secs // 60)}m {int(eta_secs % 60)}s" if eta_secs > 0 else "—"

                push_event("progress", {
                    "percent": pct,
                    "text": f"Processing {processed + 1}/{total}",
                    "phase": speed_text,
                    "eta": eta_str,
                })

                video_url = f"https://www.youtube.com/watch?v={vid_id}"
                video_info = ydl_d.extract_info(video_url, download=False)

                view_count = video_info.get("view_count", 0)

                if view_count and view_count >= min_views:
                    qualifying += 1
                    title = video_info.get("title", "Unknown Title")
                    upload_raw = video_info.get("upload_date", "")
                    try:
                        upload_date = datetime.strptime(upload_raw, "%Y%m%d").strftime("%Y-%m-%d")
                    except Exception:
                        upload_date = ""

                    video_data = {
                        "title": title,
                        "url": video_url,
                        "views": view_count,
                        "views_fmt": f"{view_count:,}",
                        "views_short": format_views(view_count),
                        "duration": format_duration(video_info.get("duration")),
                        "upload_date": upload_date,
                        "thumbnail": video_info.get("thumbnail", ""),
                    }
                    state.current_videos.append(video_data)
                    push_event("video_found", {"video": video_data, "count": qualifying})

                processed += 1

            except Exception:
                errors += 1
                adaptive_rate_limit(success=False)
                if errors > 5:
                    state.adaptive_delay = min(10.0, state.adaptive_delay * 2)
                processed += 1
                continue

    if not state.stop_requested:
        state.current_videos.sort(key=lambda x: x["views"], reverse=True)
        push_event("complete", {
            "videos": state.current_videos,
            "total_scanned": total,
            "qualifying": qualifying,
            "elapsed": f"{time.time() - start_time:.1f}s",
        })

    state.running = False


# ─── Flask routes ─────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    global state

    if state.running:
        return jsonify({"error": "An analysis is already running."}), 409

    body = request.get_json(force=True)
    url = (body.get("url") or "").strip()
    min_views = int(body.get("min_views", 500_000))

    if not url:
        return jsonify({"error": "No URL provided."}), 400

    # Fresh state
    state = AnalysisState()
    state.running = True
    state.min_views = min_views

    state.thread = threading.Thread(
        target=run_analysis, args=(url, min_views), daemon=True
    )
    state.thread.start()

    return jsonify({"status": "started"})


@app.route("/stop", methods=["POST"])
def stop():
    state.stop_requested = True
    return jsonify({"status": "stop_requested"})


@app.route("/stream")
def stream():
    """Server-Sent Events endpoint."""
    def generate():
        while True:
            try:
                event = state.event_queue.get(timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] in ("complete", "error", "stopped"):
                    break
            except queue.Empty:
                yield ": keepalive\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/status")
def status():
    return jsonify({
        "running": state.running,
        "videos_found": len(state.current_videos),
        "channel": state.current_channel_url,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)
