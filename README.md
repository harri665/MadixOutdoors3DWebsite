# Madix Outdoors — Interactive 3D Product Website

**Live site:** https://madixoutdoors.harrison-martin.com/

A scroll-driven, interactive 3D website built to showcase an outdoor product in a polished, web-friendly “product reveal” style experience. The site combines a full-screen 3D viewer with section-based storytelling, camera choreography, and on-model annotations.

## Features

- **Scroll-to-animate presentation** with section-based transitions
- **3D product viewer** rendered in the browser (WebGL)
- **Camera rig system** with predefined camera poses and smooth interpolation
- **Annotation system + 2D overlays** to highlight product details
- Loading screen optimized for large 3D assets (model-first UX)

## Tech Stack

- **Frontend:** React (Create React App via `react-app-rewired`)
- **3D:** Three.js + React Three Fiber (`@react-three/fiber`) + Drei (`@react-three/drei`)
- **Extra 3D tooling:** Babylon.js packages included (for loaders/material workflows)
- **Styling:** Tailwind CSS
- **Deployment:** Docker multi-stage build + **nginx** (static hosting)

## Local Development

### Prerequisites
- Node.js + npm

### Run locally
```bash
npm install
npm start
```

### Production build
```bash
npm run build
```

## Docker (Production-style)

Build and run with Docker Compose:

```bash
docker compose up --build
```

By default the compose file exposes the nginx container on:
- http://localhost:9042

## Project Notes / Architecture

At a high level:
- The main app mounts a full-screen `<Canvas />` and uses a **camera rig** to control viewpoint.
- Scrolling triggers **section-based camera poses** (position + target) for guided flythroughs.
- An **annotation system** provides interactive callouts tied to the 3D scene, rendered as DOM overlays.

Key entry points:
- `src/App.js` — app shell, 3D canvas, loading overlay, and scroll-driven layout
- `docker-compose.yml`, `Dockerfile`, `nginx.conf` — production container + static hosting

---

**Author:** Harrison (`harri665`)
