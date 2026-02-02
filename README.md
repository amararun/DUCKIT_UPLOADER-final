# DuckIt Uploader

Browser-based tool for creating shareable links for DuckDB databases and Parquet files.

## What It Does

| Feature | Description |
|---------|-------------|
| **Build Database** | Drop CSV/TSV files → converts to Parquet in browser → uploads → backend creates DuckDB → get shareable link |
| **Quick Upload** | Upload existing DuckDB or Parquet files directly → get shareable link |
| **CSV → Parquet** | Convert CSV to Parquet entirely in browser → optionally upload for shareable link |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS 4 |
| Database Engine | DuckDB-WASM (browser-side) |
| Auth | Neon Auth (Better Auth + Google OAuth) |

## Companion Backend

This frontend requires a FastAPI backend for file storage and DuckDB conversion.

**Backend Repo**: `shared-FASTAPI_DUCKIT`

## Quick Start

```bash
# Clone
git clone https://github.com/your-username/shared-DUCKIT_UPLOADER.git
cd shared-DUCKIT_UPLOADER

# Install
npm install

# Configure (see Environment Variables below)
cp .env.example .env

# Run
npm run dev
```

## Environment Variables

Create a `.env` file:

```env
# Neon Auth endpoint for Google OAuth
VITE_NEON_AUTH_URL=https://your-project.neon.tech/auth

# Neon Data API for database operations
VITE_NEON_DATA_API_URL=https://your-project.neon.tech/data

# Backend API URL
VITE_DUCKIT_SERVER_URL=https://your-backend-url.com

# API key for backend authentication
VITE_DATENUM=your-api-key
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ CSV Input   │───>│ DuckDB-WASM │───>│  Parquet    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└───────────────────────────┬─────────────────────────────────┘
                            │ Upload (ZIP)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Receive    │───>│  Convert    │───>│   Store     │     │
│  │  Parquet    │    │  to DuckDB  │    │   + URL     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Processing Location**:
- CSV → Parquet: Browser (DuckDB-WASM, no server upload)
- Parquet → DuckDB: Backend (after upload)

## Storage Tiers

| Tier | Who | Retention |
|------|-----|-----------|
| Temp | Anonymous users | Short-term, FIFO cleanup |
| Persistent | Signed-in users | Longer retention |
| Permanent | Admin | No auto-delete |

## Security

- Signed URLs with cryptographic tokens
- Time-limited download links
- Rate limiting on all endpoints
- Backend validates all uploads (frontend checks are for UX only)

## Database Tables (Neon PostgreSQL)

| Table | Purpose |
|-------|---------|
| `user`, `account`, `session` | Auth (managed by Neon Auth) |
| `app_users` | Per-user role and limits |
| `app_defaults` | Default limits per role |
| `files` | File tracking with soft delete |

## Build

```bash
npm run build    # Production build to dist/
```

## Related Repos

| Repo | Description |
|------|-------------|
| `shared-FASTAPI_DUCKIT` | FastAPI backend for file storage and DuckDB conversion |


## Author

Built by [Amar Harolikar](https://www.linkedin.com/in/amarharolikar/)

Explore 30+ open source AI tools for analytics, databases & automation at [tigzig.com](https://tigzig.com)
