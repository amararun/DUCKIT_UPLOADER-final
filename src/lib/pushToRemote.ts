import JSZip from 'jszip'
import { getConnection, getTables, initDuckDB } from './duckdb'

// Storage status interface - simplified, no internal details exposed
export interface StorageStatus {
  available_mb: number
  usage_percent: number
  file_count: number
  can_upload: boolean
  max_file_size_mb: number
}

/**
 * Fetch storage status via serverless proxy
 * API key is added server-side - never exposed to frontend
 */
export async function getStorageStatus(tier: 'temp' | 'persistent' = 'temp'): Promise<StorageStatus | null> {
  try {
    const response = await fetch(`/api/status?tier=${tier}`)

    if (!response.ok) {
      console.error('Failed to fetch storage status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('📊 [STORAGE STATUS]', data)

    return {
      available_mb: data.available_mb || 0,
      usage_percent: data.usage_percent || 0,
      file_count: data.file_count || 0,
      can_upload: data.can_upload ?? true,
      max_file_size_mb: data.max_file_size_mb || 150,
    }
  } catch (error) {
    console.error('Error fetching storage status:', error)
    return null
  }
}

export interface PushToRemoteResult {
  success: boolean
  downloadUrl?: string
  filename?: string
  sizeBytes?: number
  expiresInHours?: number
  error?: string
}

export interface ProgressCallback {
  (progress: { stage: string; message: string; percent?: number }): void
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

interface UploadTokenResponse {
  token: string
  filename: string
  storage_tier: string
  expires_in: number
  upload_url: string
  full_upload_url: string
  max_size_mb: number
}

/**
 * Get an upload token from the serverless proxy
 * The API key is kept server-side for security
 */
async function getUploadToken(
  filename: string,
  contentLength: number,
  storageTier: string
): Promise<UploadTokenResponse> {
  const response = await fetch('/api/upload-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      content_length: contentLength,
      storage_tier: storageTier,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get upload token: ${response.status} - ${errorText}`)
  }

  return response.json()
}

/**
 * Upload a file directly to the backend using a token
 * Supports large files (bypasses Vercel 4.5MB limit)
 * Uses XMLHttpRequest for progress tracking
 */
async function uploadWithToken(
  file: File | Blob,
  filename: string,
  tokenResponse: UploadTokenResponse,
  onProgress?: (progress: UploadProgress) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file, filename)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          reject(new Error(error.detail || error.error || `HTTP ${xhr.status}`))
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`))
        }
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'))
    })

    xhr.open('POST', tokenResponse.full_upload_url)
    xhr.send(formData)
  })
}

/**
 * Export all tables as a ZIP bundle containing Parquet files
 */
async function exportAsZipBundle(
  onProgress?: ProgressCallback
): Promise<{ buffer: Uint8Array; sizeBytes: number }> {
  const db = await initDuckDB()
  const connection = await getConnection()
  const tables = await getTables()

  if (tables.length === 0) {
    throw new Error('No tables to export')
  }

  onProgress?.({ stage: 'exporting', message: 'Creating ZIP bundle...', percent: 0 })

  const zip = new JSZip()
  const manifest: {
    tables: { name: string; files: string[]; rowCount: number }[]
    chunked: boolean
  } = {
    tables: [],
    chunked: false,
  }

  // Export each table as Parquet
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i]
    const fileName = `${table.name}.parquet`
    const percent = Math.round(((i + 1) / tables.length) * 80)

    onProgress?.({
      stage: 'exporting',
      message: `Exporting ${table.name}...`,
      percent,
    })

    // Export table to Parquet file in DuckDB virtual filesystem
    await connection.query(`COPY "${table.name}" TO '${fileName}' (FORMAT PARQUET)`)

    // Read the file from virtual filesystem
    const buffer = await db.copyFileToBuffer(fileName)

    // Add to ZIP
    zip.file(fileName, buffer)

    // Add to manifest
    manifest.tables.push({
      name: table.name,
      files: [fileName],
      rowCount: table.rowCount,
    })
  }

  // Add manifest.json
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  // Generate schema.sql
  const schemaStatements: string[] = []
  for (const table of tables) {
    const columns = table.columns.map((c) => `"${c.name}" ${c.type}`).join(',\n  ')
    schemaStatements.push(`CREATE TABLE "${table.name}" (\n  ${columns}\n);`)
  }
  zip.file('schema.sql', schemaStatements.join('\n\n'))

  // Add README
  const readme = `# DuckIt Export

This ZIP bundle was created by DuckIt (https://duckit.tigzig.com).

## Contents
- manifest.json: Table metadata
- schema.sql: DDL statements
- *.parquet: Table data files

## Tables
${tables.map((t) => `- ${t.name}: ${t.rowCount.toLocaleString()} rows`).join('\n')}

## Usage
Import into DuckDB:
\`\`\`sql
-- For each table:
CREATE TABLE table_name AS SELECT * FROM read_parquet('table_name.parquet');
\`\`\`
`
  zip.file('README.md', readme)

  onProgress?.({ stage: 'compressing', message: 'Compressing ZIP...', percent: 85 })

  // Generate compressed ZIP
  const zipBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  return { buffer: zipBuffer, sizeBytes: zipBuffer.length }
}

// Storage tier type - matches backend
export type StorageTier = 'temp' | 'persistent' | 'permanent'

/**
 * Push database to remote server as ZIP bundle
 * Uses token-based upload for security (API key never exposed to frontend)
 */
export async function pushToRemote(
  databaseName: string = 'database',
  onProgress?: ProgressCallback,
  storageTier: StorageTier = 'temp'
): Promise<PushToRemoteResult> {
  try {
    console.log('🚀 [PUSH TO REMOTE] Starting ZIP bundle upload...')

    // Step 1: Export as ZIP bundle
    const exportResult = await exportAsZipBundle(onProgress)
    const zipFilename = `${databaseName}.zip`

    console.log(`✅ ZIP created: ${(exportResult.sizeBytes / 1024 / 1024).toFixed(2)} MB`)

    // Step 2: Get upload token from serverless proxy
    onProgress?.({
      stage: 'uploading',
      message: 'Getting upload authorization...',
      percent: 88,
    })

    console.log(`🔐 Getting upload token (storage_tier: ${storageTier})...`)
    const tokenResponse = await getUploadToken(zipFilename, exportResult.sizeBytes, storageTier)
    console.log('✅ Token received:', tokenResponse.token.substring(0, 8) + '...')

    // Step 3: Upload directly to backend using token
    onProgress?.({
      stage: 'uploading',
      message: 'Uploading to server...',
      percent: 90,
    })

    console.log(`📤 Uploading to ${tokenResponse.full_upload_url}...`)
    const blob = new Blob([new Uint8Array(exportResult.buffer)], { type: 'application/zip' })

    const result = await uploadWithToken(
      blob,
      zipFilename,
      tokenResponse,
      (progress) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${progress.percentage}%`,
          percent: 90 + Math.round(progress.percentage * 0.1),
        })
      }
    )

    console.log('✅ Upload successful!')
    console.log('📋 Backend response:', result)

    onProgress?.({
      stage: 'complete',
      message: 'Upload complete!',
      percent: 100,
    })

    return {
      success: true,
      downloadUrl: result.download_url,
      filename: result.filename,
      sizeBytes: exportResult.sizeBytes,
      expiresInHours: result.expires_in_hours,
    }
  } catch (error: any) {
    console.error('❌ Push to remote failed:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Direct upload of Parquet or DuckDB file (no conversion needed)
 * Uses token-based upload for security (API key never exposed to frontend)
 * Supports large files up to 150MB
 */
export async function uploadDirectFile(
  file: File,
  onProgress?: ProgressCallback,
  storageTier: StorageTier = 'temp'
): Promise<PushToRemoteResult> {
  try {
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isParquet = fileExtension === 'parquet'
    const isDuckDB = fileExtension === 'duckdb' || fileExtension === 'db'

    if (!isParquet && !isDuckDB) {
      throw new Error('Only .parquet and .duckdb files are supported for direct upload')
    }

    console.log(`🚀 [DIRECT UPLOAD] Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB), storage_tier: ${storageTier}...`)

    // Step 1: Get upload token from serverless proxy
    onProgress?.({
      stage: 'uploading',
      message: 'Getting upload authorization...',
      percent: 5,
    })

    console.log('🔐 Getting upload token...')
    const tokenResponse = await getUploadToken(file.name, file.size, storageTier)
    console.log('✅ Token received:', tokenResponse.token.substring(0, 8) + '...')

    // Step 2: Upload directly to backend using token
    onProgress?.({
      stage: 'uploading',
      message: `Uploading ${file.name}...`,
      percent: 10,
    })

    console.log(`📤 Uploading to ${tokenResponse.full_upload_url}...`)

    const result = await uploadWithToken(
      file,
      file.name,
      tokenResponse,
      (progress) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${progress.percentage}%`,
          percent: 10 + Math.round(progress.percentage * 0.9),
        })
      }
    )

    console.log('✅ Upload successful!')
    console.log('📋 Backend response:', result)

    onProgress?.({
      stage: 'complete',
      message: 'Upload complete!',
      percent: 100,
    })

    return {
      success: true,
      downloadUrl: result.download_url,
      filename: result.filename,
      sizeBytes: file.size,
      expiresInHours: result.expires_in_hours,
    }
  } catch (error: any) {
    console.error('❌ Direct upload failed:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Upload a Parquet buffer (from browser conversion) to the server
 * Uses token-based upload for security (API key never exposed to frontend)
 */
export async function uploadParquetBuffer(
  buffer: Uint8Array,
  filename: string,
  onProgress?: ProgressCallback,
  storageTier: StorageTier = 'temp'
): Promise<PushToRemoteResult> {
  try {
    const parquetFilename = filename.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '.parquet')

    console.log(`🚀 [PARQUET UPLOAD] Uploading ${parquetFilename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB), storage_tier: ${storageTier}...`)

    // Step 1: Get upload token from serverless proxy
    onProgress?.({
      stage: 'uploading',
      message: 'Getting upload authorization...',
      percent: 40,
    })

    console.log('🔐 Getting upload token...')
    const tokenResponse = await getUploadToken(parquetFilename, buffer.length, storageTier)
    console.log('✅ Token received:', tokenResponse.token.substring(0, 8) + '...')

    // Step 2: Upload directly to backend using token
    onProgress?.({
      stage: 'uploading',
      message: `Uploading ${parquetFilename}...`,
      percent: 50,
    })

    console.log(`📤 Uploading to ${tokenResponse.full_upload_url}...`)
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' })

    const result = await uploadWithToken(
      blob,
      parquetFilename,
      tokenResponse,
      (progress) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${progress.percentage}%`,
          percent: 50 + Math.round(progress.percentage * 0.5),
        })
      }
    )

    console.log('✅ Upload successful!')
    console.log('📋 Backend response:', result)

    onProgress?.({
      stage: 'complete',
      message: 'Upload complete!',
      percent: 100,
    })

    return {
      success: true,
      downloadUrl: result.download_url,
      filename: result.filename,
      sizeBytes: buffer.length,
      expiresInHours: result.expires_in_hours,
    }
  } catch (error: any) {
    console.error('❌ Parquet upload failed:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
