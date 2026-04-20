# YT Channel Analyzer

> A Flask-powered web application that scans any YouTube channel and surfaces every video above a configurable views threshold — built to be fast, lightweight, and portfolio-ready.

![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=flat&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=flat&logo=flask)
![yt-dlp](https://img.shields.io/badge/yt--dlp-latest-FF0000?style=flat&logo=youtube)
![License](https://img.shields.io/badge/License-GPLv3-blue?style=flat)

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Live streaming results** | Videos appear in real-time via Server-Sent Events (SSE) — no waiting for a full scan |
| **Adaptive rate limiting** | Automatically adjusts request speed based on success/error rate to avoid IP bans |
| **Configurable threshold** | Set any minimum view count (default: 500 K) before starting |
| **Stop & Save** | Halt an in-progress scan at any time; results collected so far are preserved |
| **Export to .txt** | One-click export of all results with views, duration, and upload date |
| **Premium dark UI** | Glassmorphism cards, smooth animations, responsive grid layout |

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/ReyesChianrossC/YT-Channel-Analyzer.git
cd YT-Channel-Analyzer
```

### 2. Install dependencies

```bash
pip install flask yt-dlp
```

### 3. Run

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

---

## 🗂 Project Structure

```
YT-Channel-Analyzer/
├── app.py               ← Flask backend (SSE, analysis logic)
├── templates/
│   └── index.html       ← Single-page web UI
├── static/
│   ├── style.css        ← Premium dark-theme stylesheet
│   └── script.js        ← Client-side SSE + UI logic
└── README.md
```

---

## ⚙️ How It Works

1. **Phase 1 — Fast flat scan**: `yt-dlp` fetches the channel's video ID list with `extract_flat=True` (no per-video API calls).
2. **Phase 2 — Detailed fetch**: Each video ID is fetched individually. The adaptive rate limiter watches success/error ratios and adjusts sleep intervals (0.5 s → 5 s) plus injects random jitter to mimic organic browsing patterns.
3. **Streaming to the browser**: The Flask `/stream` endpoint uses chunked SSE to push `progress`, `video_found`, `complete`, and `error` events. The client renders video cards in real-time without polling.

---

## 🧰 Tech Stack

- **Backend**: Python 3.9+, Flask 3.x
- **Scraping**: yt-dlp (no API key required)
- **Frontend**: Vanilla HTML5 / CSS3 / ES6 JavaScript
- **Comms**: Server-Sent Events (SSE)

---

## 📄 License

GPLv3 — see the [LICENSE](LICENSE) file for details.
