# Collaborative Code Editor 🚀

A real-time, multi-user collaborative code editor with a built-in remote execution engine. This full-stack application allows multiple users to write, edit, and securely execute code together in the same virtual room with zero merge conflicts.

## 🌟 Key Features

- **Real-Time Collaboration:** Built with [Yjs](https://docs.yjs.dev/) and WebSockets, ensuring seamless, conflict-free (CRDT) multi-user text synchronization.
- **Remote Code Execution Engine:** Securely compiles and executes user code (C++, Python, Node.js) inside isolated, sandboxed Docker containers with strict CPU, memory, and network limits.
- **State Persistence:** Uses LevelDB (`y-leveldb`) on the backend to persist document states so code survives server restarts.
- **Standard Input Support:** Fully supports reading from `stdin` allowing users to test complex algorithms.
- **Live Presence:** See who else is currently active in the room and get instant execution time analytics.

## 🛠️ Tech Stack

**Frontend:**
- React 18 & Vite
- Monaco Editor (The core editor that powers VS Code)
- `y-websocket` & `y-monaco` bindings

**Backend:**
- Node.js & Express
- WebSockets (`ws`)
- Docker CLI (for sandboxed execution)
- LevelDB

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+)
- Docker (Must be running for the execution engine to work)

### 1. Start the Sync & Execution Backend
Open a terminal and run:
```bash
cd sync-server
npm install
npm run dev
```
The backend will start on `ws://localhost:1234` and `http://localhost:1234`.

### 2. Start the Frontend
Open a new terminal and run:
```bash
cd frontend
npm install
npm run dev
```
The frontend will start on `http://localhost:5173`.

## 📦 Deployment Configuration

This project is built to be deployed easily across modern cloud providers.

**Frontend (Vercel/Netlify):**
Make sure to configure the following Environment Variables in your hosting provider to point to your live backend:
- `VITE_WS_URL` = `wss://your-backend-url.com`
- `VITE_API_URL` = `https://your-backend-url.com`

**Backend (Render/Fly.io):**
The `sync-server` folder includes a fully configured `Dockerfile`. Ensure your hosting provider has Docker-in-Docker (or host Docker socket) support enabled to allow the backend to spawn execution containers.

## 👤 Author
- **Ashwini Kumar**
- [GitHub](https://github.com/ashwinikr295)
- [LinkedIn](https://www.linkedin.com/in/ashwini-kumar-6928a527a/)
 

 live link - https://coedit-live.vercel.app/