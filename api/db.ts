/**
 * Vercel Serverless Function: Database API Proxy
 *
 * Single endpoint that handles all database operations.
 * Hides Neon Data API URL and table names from frontend.
 *
 * Operations:
 * - user.check: Check/register user access
 * - user.role: Get user role
 * - user.limits: Get effective limits
 * - files.list: List user's files
 * - files.count: Get file count
 * - files.add: Add file record
 * - files.rename: Rename file
 * - files.delete: Soft delete file
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const NEON_DATA_API_URL = process.env.NEON_DATA_API_URL || ''
const DUCKIT_SERVER_URL = process.env.DUCKIT_SERVER_URL || 'https://duckit-backend.tigzig.com'
const DATENUM = process.env.DATENUM || ''
const APP_NAME = 'duckit'

// Helper to make Neon requests with JWT authentication
async function neonFetch(path: string, jwt: string, options: RequestInit = {}): Promise<any> {
  const url = `${NEON_DATA_API_URL}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Neon API error: ${response.status} - ${error}`)
  }

  // Handle empty responses
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!NEON_DATA_API_URL) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  // Extract JWT from Authorization header
  const authHeader = req.headers.authorization || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!jwt) {
    return res.status(401).json({ error: 'Authorization required' })
  }

  try {
    const { operation, email, ...params } = req.body

    if (!operation) {
      return res.status(400).json({ error: 'Missing operation' })
    }

    const normalizedEmail = email?.toLowerCase()

    // ==================== USER OPERATIONS ====================

    if (operation === 'user.check') {
      // Check user access and auto-register if needed
      const { userId } = params

      // Check if user exists
      const users = await neonFetch(
        `/app_users?email=eq.${normalizedEmail}&app_name=eq.${APP_NAME}&select=role,status,limits`,
        jwt
      )

      if (users && users.length > 0) {
        const user = users[0]
        // Get role defaults
        const defaults = await neonFetch(
          `/app_defaults?app_name=eq.${APP_NAME}&role=eq.${user.role || 'pro'}&select=default_limits`,
          jwt
        )
        const effectiveLimits = { ...(defaults?.[0]?.default_limits || {}), ...(user.limits || {}) }

        return res.status(200).json({
          allowed: user.status !== 'blocked',
          role: user.role || 'pro',
          limits: effectiveLimits
        })
      }

      // Auto-register new user
      await neonFetch('/app_users', jwt, {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          email: normalizedEmail,
          app_name: APP_NAME,
          role: 'pro',
          status: 'allowed',
          notes: 'Auto-registered'
        }),
      })

      // Get pro defaults
      const defaults = await neonFetch(
        `/app_defaults?app_name=eq.${APP_NAME}&role=eq.pro&select=default_limits`,
        jwt
      )

      return res.status(200).json({
        allowed: true,
        role: 'pro',
        limits: defaults?.[0]?.default_limits || {}
      })
    }

    if (operation === 'user.role') {
      const users = await neonFetch(
        `/app_users?email=eq.${normalizedEmail}&app_name=eq.${APP_NAME}&select=role`,
        jwt
      )
      return res.status(200).json({ role: users?.[0]?.role || 'pro' })
    }

    if (operation === 'user.limits') {
      // Get user role and limits
      const users = await neonFetch(
        `/app_users?email=eq.${normalizedEmail}&app_name=eq.${APP_NAME}&select=role,limits`,
        jwt
      )
      const role = users?.[0]?.role || 'pro'
      const userLimits = users?.[0]?.limits || {}

      // Get role defaults
      const defaults = await neonFetch(
        `/app_defaults?app_name=eq.${APP_NAME}&role=eq.${role}&select=default_limits`,
        jwt
      )
      const effectiveLimits = { ...(defaults?.[0]?.default_limits || {}), ...userLimits }

      return res.status(200).json({ role, limits: effectiveLimits })
    }

    // ==================== FILE OPERATIONS ====================

    if (operation === 'files.list') {
      const files = await neonFetch(
        `/files?user_email=eq.${normalizedEmail}&or=(is_deleted.is.null,is_deleted.eq.false)&order=created_at.desc`,
        jwt
      )
      return res.status(200).json({ files: files || [] })
    }

    if (operation === 'files.count') {
      const files = await neonFetch(
        `/files?user_email=eq.${normalizedEmail}&or=(is_deleted.is.null,is_deleted.eq.false)&select=id`,
        jwt
      )
      return res.status(200).json({ count: files?.length || 0 })
    }

    if (operation === 'files.add') {
      const { user_id, server_filename, display_name, download_url, size_mb, format } = params

      const result = await neonFetch('/files', jwt, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id,
          user_email: normalizedEmail,
          server_filename,
          display_name,
          download_url,
          size_mb,
          format,
        }),
      })

      return res.status(200).json({ file: result?.[0] || null })
    }

    if (operation === 'files.rename') {
      const { id, display_name } = params

      await neonFetch(`/files?id=eq.${id}&user_email=eq.${normalizedEmail}`, jwt, {
        method: 'PATCH',
        body: JSON.stringify({ display_name }),
      })

      return res.status(200).json({ success: true })
    }

    if (operation === 'files.delete') {
      const { id } = params

      // Get server_filename first
      const files = await neonFetch(
        `/files?id=eq.${id}&user_email=eq.${normalizedEmail}&select=server_filename`,
        jwt
      )
      const serverFilename = files?.[0]?.server_filename

      // Delete from backend storage
      if (serverFilename && DATENUM) {
        try {
          const formData = new URLSearchParams()
          formData.append('filename', serverFilename)
          formData.append('datenum', DATENUM)

          await fetch(`${DUCKIT_SERVER_URL}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
          })
        } catch (e) {
          console.warn('[DB API] Backend delete failed:', e)
        }
      }

      // Soft delete in database
      await neonFetch(`/files?id=eq.${id}&user_email=eq.${normalizedEmail}`, jwt, {
        method: 'PATCH',
        body: JSON.stringify({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        }),
      })

      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: `Unknown operation: ${operation}` })

  } catch (error: any) {
    console.error('[DB API] Error:', error.message)
    return res.status(500).json({ error: error.message || 'Internal error' })
  }
}
