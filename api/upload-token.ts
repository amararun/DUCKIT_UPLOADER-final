/**
 * Vercel Serverless Function: Upload Token Proxy
 *
 * This function securely generates upload tokens from the FastAPI backend.
 * The API key (DATENUM) is stored server-side and never exposed to the frontend.
 *
 * Flow:
 * 1. Frontend calls /api/upload-token with filename and storage_tier
 * 2. This function adds the API key and forwards to backend
 * 3. Backend returns a short-lived upload token
 * 4. Frontend uses the token to upload directly to backend (no Vercel size limit)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Server-side only - NOT exposed to frontend
const DUCKIT_SERVER_URL = process.env.DUCKIT_SERVER_URL || 'https://duckit-backend.tigzig.com'
const DATENUM = process.env.DATENUM || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check if API key is configured
  if (!DATENUM) {
    console.error('[UPLOAD TOKEN] DATENUM environment variable not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const { filename, content_length, storage_tier } = req.body || {}

    if (!filename) {
      return res.status(400).json({ error: 'Missing filename parameter' })
    }

    console.log(`[UPLOAD TOKEN] Requesting token for: ${filename}, tier: ${storage_tier || 'temp'}`)

    // Forward request to backend with API key in header
    const backendUrl = `${DUCKIT_SERVER_URL.replace(/\/$/, '')}/upload-token`

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DATENUM}`,
      },
      body: JSON.stringify({
        filename,
        content_length,
        storage_tier: storage_tier || 'temp',
      }),
    })

    const responseText = await response.text()
    console.log(`[UPLOAD TOKEN] Backend response: ${response.status}`)

    if (!response.ok) {
      console.error(`[UPLOAD TOKEN] Backend error: ${response.status} - ${responseText}`)
      return res.status(response.status).json({
        error: `Failed to get upload token: ${responseText}`
      })
    }

    // Parse and return the token response
    const result = JSON.parse(responseText)

    // Add the full upload URL for the frontend
    result.full_upload_url = `${DUCKIT_SERVER_URL.replace(/\/$/, '')}${result.upload_url}`

    console.log(`[UPLOAD TOKEN] Success: token generated for ${filename}`)

    return res.status(200).json(result)

  } catch (error: any) {
    console.error('[UPLOAD TOKEN] Error:', error.message)
    return res.status(500).json({
      error: error.message || 'Failed to get upload token'
    })
  }
}
