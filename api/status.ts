/**
 * Vercel Serverless Function: Status Proxy
 *
 * This function securely proxies status requests to the FastAPI backend.
 * The API key (DATENUM) is stored server-side and never exposed to the frontend.
 *
 * Returns only the information the frontend needs, hiding internal details.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Server-side only - NOT exposed to frontend
const DUCKIT_SERVER_URL = process.env.DUCKIT_SERVER_URL || 'https://duckit-backend.tigzig.com'
const DATENUM = process.env.DATENUM || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check if API key is configured
  if (!DATENUM) {
    console.error('[STATUS PROXY] DATENUM environment variable not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    // Get storage tier from query param (optional)
    const storageTier = (req.query.tier as string) || 'temp'

    console.log(`[STATUS PROXY] Checking storage status for tier: ${storageTier}`)

    // Forward request to backend with API key
    const backendUrl = `${DUCKIT_SERVER_URL.replace(/\/$/, '')}/status`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DATENUM}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[STATUS PROXY] Backend error: ${response.status} - ${errorText}`)
      return res.status(response.status).json({
        error: 'Failed to get status'
      })
    }

    const data = await response.json()

    // Return only what frontend needs - hide internal details
    // Frontend only needs to know: can I upload? how much space is available for my tier?
    let currentUsageMb: number
    let maxCapacityMb: number
    let fileCount: number

    if (storageTier === 'persistent') {
      currentUsageMb = data.persistent_size_mb || 0
      maxCapacityMb = data.persistent_max_mb || 10240
      fileCount = data.persistent_files || 0
    } else {
      currentUsageMb = data.temp_size_mb || 0
      maxCapacityMb = data.temp_max_mb || 2048
      fileCount = data.temp_files || 0
    }

    const availableMb = maxCapacityMb - currentUsageMb
    const usagePercent = Math.round((currentUsageMb / maxCapacityMb) * 100)

    // Return sanitized response - no internal allocation numbers
    const sanitizedResponse = {
      status: 'ok',
      tier: storageTier,
      available_mb: Math.round(availableMb),
      usage_percent: usagePercent,
      file_count: fileCount,
      can_upload: availableMb > 1, // At least 1MB available
      max_file_size_mb: data.max_file_size_mb || 150,
    }

    console.log(`[STATUS PROXY] Success: ${storageTier} tier, ${availableMb.toFixed(1)}MB available`)

    return res.status(200).json(sanitizedResponse)

  } catch (error: any) {
    console.error('[STATUS PROXY] Error:', error.message)
    return res.status(500).json({
      error: 'Failed to get status'
    })
  }
}
