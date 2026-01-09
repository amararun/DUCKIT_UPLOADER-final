/**
 * Vercel Serverless Function: Delete Proxy
 *
 * This function securely proxies delete requests to the FastAPI backend.
 * The API key (DATENUM) is stored server-side and never exposed to the frontend.
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
    console.error('[DELETE PROXY] DATENUM environment variable not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const { filename } = req.body || {}

    if (!filename) {
      return res.status(400).json({ error: 'Missing filename parameter' })
    }

    console.log(`[DELETE PROXY] Deleting file: ${filename}`)

    // Forward delete request to backend with API key
    const backendUrl = `${DUCKIT_SERVER_URL.replace(/\/$/, '')}/delete`

    const formData = new URLSearchParams()
    formData.append('filename', filename)
    formData.append('datenum', DATENUM)

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const responseText = await response.text()
    console.log(`[DELETE PROXY] Backend response: ${response.status}`)

    if (!response.ok) {
      console.error(`[DELETE PROXY] Backend error: ${response.status} - ${responseText}`)
      return res.status(response.status).json({
        error: `Delete failed: ${responseText}`
      })
    }

    // Parse and return the response
    const result = JSON.parse(responseText)
    console.log(`[DELETE PROXY] Success: ${filename} deleted`)

    return res.status(200).json(result)

  } catch (error: any) {
    console.error('[DELETE PROXY] Error:', error.message)
    return res.status(500).json({
      error: error.message || 'Delete failed'
    })
  }
}
