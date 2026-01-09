/**
 * Database Client for DuckIt
 * All database operations go through /api/db serverless proxy.
 * This hides Neon URLs and table names from the browser.
 */

import { neonClient, isNeonConfigured } from './neon-client'

// Re-export for compatibility
export const isNeonDataConfigured = isNeonConfigured

// Types for our database tables
export interface AppUser {
  id: number
  user_id: string
  email: string
  app_name: string
  role: 'pro' | 'admin'
  status: 'allowed' | 'blocked'
  limits: Record<string, number | null> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AppDefaults {
  app_name: string
  role: 'pro' | 'admin'
  display_name: string
  default_limits: Record<string, number | null>
  created_at: string
  updated_at: string
}

export interface UsageTracking {
  id: number
  email: string
  app_name: string
  metric: string
  period: string
  count: number
  updated_at: string
}

export interface FileRecord {
  id: string
  user_id: string
  user_email: string
  server_filename: string
  display_name: string
  download_url: string
  size_mb: number | null
  format: string | null
  created_at: string
  updated_at: string
  is_deleted?: boolean
  deleted_at?: string | null
}

export interface UploadValidation {
  allowed: boolean
  reason?: string
  userFileCount?: number
  maxFiles?: number | null
  globalStorageMb?: number
  maxGlobalStorageMb?: number
}

/**
 * Get JWT token from Neon Auth session
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const session = await neonClient.auth.getSession()
    // The session contains the JWT token (Better Auth stores it as 'token')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session?.data?.session as any)?.token || null
  } catch (err) {
    console.error('🔐 [DB] Error getting auth token:', err)
    return null
  }
}

/**
 * Call the database API proxy with JWT authentication
 */
async function dbApi(operation: string, params: Record<string, any> = {}): Promise<any> {
  const token = await getAuthToken()

  if (!token) {
    throw new Error('Not authenticated')
  }

  const response = await fetch('/api/db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, ...params }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }

  return response.json()
}

/**
 * Check if user is allowed and auto-register if needed
 */
export async function checkUserAccess(email: string): Promise<{
  allowed: boolean
  user: AppUser | null
  limits: Record<string, number | null>
}> {
  console.log('🔐 [DB] Checking user access:', email)

  if (!isNeonDataConfigured) {
    console.error('🔐 [DB] Not configured!')
    return { allowed: true, user: null, limits: {} }
  }

  try {
    // Get user ID from session (still need this from Neon Auth)
    const session = await neonClient.auth.getSession()
    const userId = session?.data?.user?.id

    const result = await dbApi('user.check', { email, userId })

    console.log('🔐 [DB] User check result:', result)

    return {
      allowed: result.allowed,
      user: { role: result.role, status: result.allowed ? 'allowed' : 'blocked' } as AppUser,
      limits: result.limits || {}
    }
  } catch (err) {
    console.error('🔐 [DB] Exception:', err)
    return { allowed: true, user: null, limits: {} }
  }
}

/**
 * Get user's role from database
 */
export async function getUserRole(email: string): Promise<'pro' | 'admin'> {
  try {
    const result = await dbApi('user.role', { email })
    return result.role === 'admin' ? 'admin' : 'pro'
  } catch (err) {
    console.error('🔐 [DB] Error getting user role:', err)
    return 'pro'
  }
}

/**
 * Get storage tier based on user role
 */
export function getStorageTier(role: 'pro' | 'admin'): 'persistent' | 'permanent' {
  return role === 'admin' ? 'permanent' : 'persistent'
}

/**
 * Get effective limits for a user
 */
export async function getEffectiveLimits(email: string): Promise<Record<string, number | null>> {
  try {
    const result = await dbApi('user.limits', { email })
    console.log('🔐 [LIMITS] Result:', result)
    return result.limits || {}
  } catch (err) {
    console.error('🔐 [DB] Error getting limits:', err)
    return {}
  }
}

/**
 * Get all files for a specific user
 */
export async function getUserFiles(userEmail: string): Promise<FileRecord[]> {
  if (!isNeonDataConfigured) return []

  try {
    const result = await dbApi('files.list', { email: userEmail })
    return result.files || []
  } catch (err) {
    console.error('Error fetching user files:', err)
    return []
  }
}

/**
 * Get user's file count
 */
export async function getUserFileCount(userEmail: string): Promise<number> {
  if (!isNeonDataConfigured) return 0

  try {
    const result = await dbApi('files.count', { email: userEmail })
    console.log('🔍 [FILE COUNT] Result:', result)
    return result.count || 0
  } catch (err) {
    console.error('Error getting file count:', err)
    return 0
  }
}

/**
 * Get total storage used by all users (in MB)
 * Note: This is now approximated from backend /api/status
 */
export async function getGlobalStorageUsed(): Promise<number> {
  // This is now handled by /api/status - return 0 as placeholder
  return 0
}

/**
 * Validate if user can upload a file
 */
export async function validateUpload(
  userEmail: string,
  fileSizeMb: number,
  limits: Record<string, number | null>
): Promise<UploadValidation> {
  const userFileCount = await getUserFileCount(userEmail)
  const maxFiles = limits.max_files ?? null

  console.log('🔍 [VALIDATE] Checking upload:',
    'userEmail:', userEmail,
    'userFileCount:', userFileCount,
    'maxFiles:', maxFiles
  )

  // Check max files limit
  if (maxFiles !== null && userFileCount >= maxFiles) {
    console.log('🔍 [VALIDATE] BLOCKED - File count limit reached')
    return {
      allowed: false,
      reason: `You have reached your file limit (${maxFiles} files). Please delete some files first.`,
      userFileCount,
      maxFiles
    }
  }

  // Check file size limit
  const maxFileSizeMb = limits.max_file_size_mb ?? null
  if (maxFileSizeMb !== null && fileSizeMb > maxFileSizeMb) {
    return {
      allowed: false,
      reason: `File size (${fileSizeMb.toFixed(1)} MB) exceeds your limit (${maxFileSizeMb} MB).`,
      userFileCount,
      maxFiles
    }
  }

  return {
    allowed: true,
    userFileCount,
    maxFiles
  }
}

/**
 * Cleanup expired files - now handled by backend
 */
export async function cleanupExpiredFiles(): Promise<number> {
  // Cleanup is now handled by backend cron job
  return 0
}

/**
 * Add a new file record
 */
export async function addFileRecord(
  file: Omit<FileRecord, 'id' | 'created_at' | 'updated_at'>
): Promise<FileRecord | null> {
  if (!isNeonDataConfigured) return null

  try {
    const result = await dbApi('files.add', {
      email: file.user_email,
      user_id: file.user_id,
      server_filename: file.server_filename,
      display_name: file.display_name,
      download_url: file.download_url,
      size_mb: file.size_mb,
      format: file.format,
    })

    return result.file || null
  } catch (err) {
    console.error('Error adding file record:', err)
    return null
  }
}

/**
 * Update file display name
 */
export async function updateFileName(id: string, displayName: string, userEmail: string): Promise<boolean> {
  if (!isNeonDataConfigured) return false

  try {
    await dbApi('files.rename', { email: userEmail, id, display_name: displayName })
    return true
  } catch (err) {
    console.error('Error updating file name:', err)
    return false
  }
}

/**
 * Delete a file - soft deletes in database and deletes from server
 */
export async function deleteFileRecord(id: string, userEmail: string): Promise<boolean> {
  if (!isNeonDataConfigured) return false

  try {
    await dbApi('files.delete', { email: userEmail, id })
    console.log('🗑️ [DELETE] File deleted:', id)
    return true
  } catch (err) {
    console.error('Error deleting file record:', err)
    return false
  }
}

/**
 * Increment usage counter - simplified, just log for now
 */
export async function incrementUsage(
  email: string,
  metric: string,
  period: string,
  increment: number = 1
): Promise<boolean> {
  // Usage tracking can be added later via API
  console.log(`📊 [USAGE] ${email}: ${metric} +${increment} (${period})`)
  return true
}

/**
 * Get current usage for a user - placeholder
 */
export async function getUserUsage(_email: string): Promise<UsageTracking[]> {
  // Usage tracking can be queried via API if needed
  return []
}
