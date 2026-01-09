import { useState, useCallback, useEffect } from 'react'
import { Database, Upload, Info, X, Loader2, Check, Copy, Download, FileUp, FileSpreadsheet, Lock, Clock } from 'lucide-react'
import { initDuckDB, getTables, getSampleRows, importCSV, convertCsvToParquet, estimateDatabaseSize, type TableInfo } from '../lib/duckdb'
import { pushToRemote, uploadDirectFile, uploadParquetBuffer, getStorageStatus, type StorageTier } from '../lib/pushToRemote'
import { useAuth } from '../contexts/AuthContext'
import { addFileRecord, validateUpload, getEffectiveLimits, getUserRole, getStorageTier } from '../lib/neon-db'
import { useElapsedTimer } from '../hooks/useElapsedTimer'

// Backend file size limit (must match Coolify MAX_FILE_SIZE_MB)
const MAX_UPLOAD_SIZE_MB = 150

export function Home() {
  const { user, isAllowed } = useAuth()

  const [isInitializing, setIsInitializing] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragOverBuild, setIsDragOverBuild] = useState(false)
  const [isDragOverQuick, setIsDragOverQuick] = useState(false)

  // User role and storage tier (loaded from Neon based on user's role)
  const [userStorageTier, setUserStorageTier] = useState<StorageTier>('temp')
  const [userRole, setUserRole] = useState<'pro' | 'admin'>('pro')
  const [isRoleLoading, setIsRoleLoading] = useState(true)  // Prevent actions until role is loaded

  // Pro features state (checkbox to opt-in to persistent/permanent storage)
  const [keepPersistent, setKeepPersistent] = useState(false)
  const [keepPersistentQuick, setKeepPersistentQuick] = useState(false)

  // Modal state
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [sampleRows, setSampleRows] = useState<any[]>([])
  const [isLoadingSample, setIsLoadingSample] = useState(false)

  // Push to remote state (Build Database)
  const [isPushing, setIsPushing] = useState(false)
  const [pushProgress, setPushProgress] = useState<string>('')
  const [pushResult, setPushResult] = useState<{ downloadUrl?: string; filename?: string; error?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Quick upload state
  const [quickStagedFile, setQuickStagedFile] = useState<File | null>(null)  // File staged for upload
  const [isQuickUploading, setIsQuickUploading] = useState(false)
  const [quickUploadProgress, setQuickUploadProgress] = useState<string>('')
  const [quickUploadResult, setQuickUploadResult] = useState<{ downloadUrl?: string; error?: string; localFile?: File } | null>(null)
  const [quickCopied, setQuickCopied] = useState(false)

  // CSV to Parquet state
  const [isDragOverParquet, setIsDragOverParquet] = useState(false)
  const [isConvertingParquet, setIsConvertingParquet] = useState(false)
  const [parquetProgress, setParquetProgress] = useState<string>('')
  const [parquetResult, setParquetResult] = useState<{
    downloadUrl?: string;
    rowCount?: number;
    error?: string;
    localBuffer?: Uint8Array;
    filename?: string;
  } | null>(null)
  const [parquetCopied, setParquetCopied] = useState(false)

  // Fallback message when persistent storage is full
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)

  // Track which storage tier was actually used for the upload (for displaying validity period)
  const [usedPersistentStorage, setUsedPersistentStorage] = useState(false)

  // File limit modal state
  const [showFileLimitModal, setShowFileLimitModal] = useState(false)
  const [fileLimitInfo, setFileLimitInfo] = useState<{ userFileCount: number; maxFiles: number } | null>(null)

  // Storage full modal state
  const [showStorageFullModal, setShowStorageFullModal] = useState(false)
  const [storageInfo, setStorageInfo] = useState<{ usedMb: number; maxMb: number; fileSizeMb: number } | null>(null)

  // Download loading states (for remote file downloads)
  const [isDownloadingBuild, setIsDownloadingBuild] = useState(false)

  // Timer start times for each operation
  const [pushStartTime, setPushStartTime] = useState<number | null>(null)
  const [quickUploadStartTime, setQuickUploadStartTime] = useState<number | null>(null)
  const [parquetStartTime, setParquetStartTime] = useState<number | null>(null)

  // Elapsed timers
  const pushTimer = useElapsedTimer({ startTime: pushStartTime, isRunning: isPushing })
  const quickUploadTimer = useElapsedTimer({ startTime: quickUploadStartTime, isRunning: isQuickUploading })
  const parquetTimer = useElapsedTimer({ startTime: parquetStartTime, isRunning: isConvertingParquet })

  // Format timer as "Xm Ys" for display after completion
  // The timer.formatted is MM:SS.mmm
  const formatTimerSimple = (formatted: string): string => {
    const parts = formatted.substring(0, 5).split(':')
    const mins = parseInt(parts[0], 10)
    const secs = parseInt(parts[1], 10)
    return `${mins}m ${secs}s`
  }

  // Initialize DuckDB on mount
  useEffect(() => {
    initDuckDB()
      .then(() => setIsInitializing(false))
      .catch((err) => {
        setError(`Failed to initialize DuckDB: ${err.message}`)
        setIsInitializing(false)
      })
  }, [])

  // Load user's role and storage tier when authenticated
  useEffect(() => {
    async function loadUserRole() {
      setIsRoleLoading(true)
      if (user?.email && isAllowed) {
        try {
          const role = await getUserRole(user.email)
          setUserRole(role)
          setUserStorageTier(getStorageTier(role))
          console.log(`User role: ${role}, storage tier: ${getStorageTier(role)}`)
        } catch (err) {
          console.error('Error loading user role:', err)
          setUserRole('pro')
          setUserStorageTier('persistent')
        }
      } else {
        // Not signed in or not allowed - default to pro (but temp storage until signed in)
        setUserRole('pro')
        setUserStorageTier('temp')
      }
      setIsRoleLoading(false)
    }
    loadUserRole()
  }, [user?.email, isAllowed])

  // Get effective storage tier for upload based on user role and checkbox state
  const getEffectiveStorageTier = useCallback((checkboxChecked: boolean): StorageTier => {
    if (!isAllowed || !checkboxChecked) {
      return 'temp'  // Default tier for everyone
    }
    // User checked the box and is allowed - use their tier
    return userStorageTier
  }, [isAllowed, userStorageTier])

  // Refresh tables list
  const refreshTables = useCallback(async () => {
    try {
      const tableList = await getTables()
      setTables(tableList)
    } catch (err: any) {
      console.error('Error getting tables:', err)
    }
  }, [])

  // Handle CSV file drop (Build Database)
  const handleBuildDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverBuild(false)
    setError(null)

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      return
    }

    const files = Array.from(e.dataTransfer.files).filter(
      f => /\.(csv|tsv|txt|pipe|psv)$/i.test(f.name)
    )

    if (files.length === 0) {
      setError('Please drop CSV, TSV, TXT, PIPE, or PSV files')
      return
    }

    setIsImporting(true)
    try {
      for (const file of files) {
        const tableName = file.name.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_')
        await importCSV(file, tableName)
      }
      await refreshTables()
    } catch (err: any) {
      setError(`Import failed: ${err.message}`)
    } finally {
      setIsImporting(false)
    }
  }, [refreshTables, isRoleLoading])

  // Handle CSV file input (Build Database)
  const handleBuildFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      return
    }

    setError(null)
    setIsImporting(true)

    try {
      for (const file of Array.from(files)) {
        const tableName = file.name.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_')
        await importCSV(file, tableName)
      }
      await refreshTables()
    } catch (err: any) {
      setError(`Import failed: ${err.message}`)
    } finally {
      setIsImporting(false)
      e.target.value = ''
    }
  }, [refreshTables, isRoleLoading])

  // Handle Quick Upload drop (Parquet/DuckDB) - stage file only, don't upload yet
  const handleQuickDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverQuick(false)
    setError(null)

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      return
    }

    const files = Array.from(e.dataTransfer.files).filter(
      f => /\.(parquet|duckdb|db)$/i.test(f.name)
    )

    if (files.length === 0) {
      setError('Please drop a Parquet or DuckDB file')
      return
    }

    if (files.length > 1) {
      setError('Quick Upload supports one file at a time')
      return
    }

    const file = files[0]

    // Pre-upload size validation (type-specific limits) - Admin bypasses all checks
    if (userRole !== 'admin') {
      const fileSizeMb = file.size / 1024 / 1024
      const isParquet = file.name.toLowerCase().endsWith('.parquet')
      const isDuckDb = file.name.toLowerCase().endsWith('.duckdb') || file.name.toLowerCase().endsWith('.db')
      const maxSizeMb = isParquet ? 75 : 150  // 75 MB for Parquet, 150 MB for DuckDB

      if (fileSizeMb > maxSizeMb) {
        const fileType = isParquet ? 'Parquet' : isDuckDb ? 'DuckDB' : 'File'
        setError(`${fileType} file too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed: ${maxSizeMb} MB`)
        return
      }
    }

    // Stage file for upload (don't upload yet)
    setQuickStagedFile(file)
    setQuickUploadResult(null)
  }, [userRole, isRoleLoading])

  // Handle Quick Upload - actually upload the staged file
  const handleQuickUpload = useCallback(async () => {
    if (!quickStagedFile) return

    setIsQuickUploading(true)
    setQuickUploadStartTime(Date.now())
    setQuickUploadResult(null)
    setFallbackMessage(null)
    setError(null)

    const file = quickStagedFile
    const fileSizeMb = file.size / 1024 / 1024

    try {
      // Determine storage tier - check limits BEFORE upload if persistent requested
      const storageTier = getEffectiveStorageTier(keepPersistentQuick)

      console.log('📤 [UPLOAD] Quick Upload starting:', {
        keepPersistentQuick,
        isAllowed,
        userEmail: user?.email,
        storageTier
      })

      // Admin role bypasses all checks (uses permanent storage directory with no limits)
      if (userRole === 'admin') {
        console.log('📤 [UPLOAD] Admin role detected - skipping all validation checks')
      } else if (keepPersistentQuick && isAllowed && user?.email && storageTier !== 'temp') {
        // Pre-upload validation: check if persistent storage is available
        console.log('📤 [UPLOAD] Running pre-upload validation...')
        const limits = await getEffectiveLimits(user.email)
        console.log('📤 [UPLOAD] Effective limits:', limits)
        const validation = await validateUpload(user.email, fileSizeMb, limits)
        console.log('📤 [UPLOAD] Validation result:', validation)

        if (!validation.allowed) {
          // Show file limit modal instead of fallback
          console.log('📤 [UPLOAD] Validation FAILED - showing modal')
          setFileLimitInfo({
            userFileCount: validation.userFileCount || 0,
            maxFiles: validation.maxFiles || 2
          })
          setShowFileLimitModal(true)
          setIsQuickUploading(false)
          setQuickUploadProgress('')
          return
        }
        console.log('📤 [UPLOAD] Validation PASSED - proceeding with upload')

        // Check backend storage capacity via serverless proxy
        console.log('📤 [UPLOAD] Checking backend storage capacity...')
        const storageStatus = await getStorageStatus('persistent')
        if (storageStatus) {
          // Calculate estimated file size: Parquet × 2 or DuckDB direct
          const isParquet = file.name.toLowerCase().endsWith('.parquet')
          const estimatedFileSizeMb = isParquet ? fileSizeMb * 2 : fileSizeMb

          console.log('📤 [UPLOAD] Storage check:', {
            available: storageStatus.available_mb,
            fileSize: fileSizeMb,
            estimatedSize: estimatedFileSizeMb
          })

          if (estimatedFileSizeMb > storageStatus.available_mb || !storageStatus.can_upload) {
            // Show storage full modal
            console.log('📤 [UPLOAD] Storage FULL - showing modal')
            setStorageInfo({
              usedMb: 0,
              maxMb: storageStatus.available_mb,
              fileSizeMb: estimatedFileSizeMb
            })
            setShowStorageFullModal(true)
            setIsQuickUploading(false)
            setQuickUploadProgress('')
            return
          }
        }
      } else {
        console.log('📤 [UPLOAD] Skipping validation - conditions not met')
      }

      const result = await uploadDirectFile(file, (progress) => {
        setQuickUploadProgress(progress.message)
      }, storageTier)

      if (result.success) {
        setQuickUploadResult({ downloadUrl: result.downloadUrl, localFile: file })
        setUsedPersistentStorage(keepPersistentQuick && isAllowed)

        // Save to Neon if persistent/permanent (not temp)
        if (keepPersistentQuick && isAllowed && user?.email && result.downloadUrl && result.filename) {
          try {
            const format = file.name.toLowerCase().endsWith('.parquet') ? 'parquet' : 'duckdb'
            await addFileRecord({
              user_id: user.id,
              user_email: user.email,
              server_filename: result.filename,
              display_name: file.name.replace(/\.(parquet|duckdb|db)$/i, ''),
              download_url: result.downloadUrl,
              size_mb: fileSizeMb,
              format
            })
            console.log('File record saved to Neon')
          } catch (err) {
            console.error('Failed to save file record:', err)
          }
        }
      } else {
        setQuickUploadResult({ error: result.error })
        setError(`Upload failed: ${result.error}`)
      }
    } catch (err: any) {
      setQuickUploadResult({ error: err.message })
      setError(`Upload failed: ${err.message}`)
    } finally {
      setIsQuickUploading(false)
      setQuickUploadProgress('')
    }
  }, [quickStagedFile, keepPersistentQuick, isAllowed, user, getEffectiveStorageTier])

  // Handle Quick Upload file input - stage file only, don't upload yet
  const handleQuickFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      e.target.value = ''
      return
    }

    const file = files[0]
    setError(null)

    // Pre-upload size validation - Admin bypasses all checks
    if (userRole !== 'admin') {
      const fileSizeMb = file.size / 1024 / 1024
      if (fileSizeMb > MAX_UPLOAD_SIZE_MB) {
        setError(`File too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed: ${MAX_UPLOAD_SIZE_MB} MB`)
        e.target.value = ''
        return
      }
    }

    // Stage file for upload (don't upload yet)
    setQuickStagedFile(file)
    setQuickUploadResult(null)
    e.target.value = ''
  }, [isRoleLoading, userRole])

  // Clear staged file
  const handleQuickClearStaged = useCallback(() => {
    setQuickStagedFile(null)
    setQuickUploadResult(null)
    setError(null)
    setFallbackMessage(null)
    setUsedPersistentStorage(false)
  }, [])

  // Open table info modal
  const openTableInfo = useCallback(async (table: TableInfo) => {
    setSelectedTable(table)
    setIsLoadingSample(true)
    try {
      const rows = await getSampleRows(table.name, 10)
      setSampleRows(rows)
    } catch (err: any) {
      console.error('Error getting sample rows:', err)
      setSampleRows([])
    } finally {
      setIsLoadingSample(false)
    }
  }, [])

  // Close modal
  const closeModal = useCallback(() => {
    setSelectedTable(null)
    setSampleRows([])
  }, [])

  // Generate database display name from table names (concat, remove special chars, first 20 chars)
  const generateDbDisplayName = useCallback(() => {
    if (tables.length === 0) return 'database'
    const combined = tables.map(t => t.name).join('')
    const cleaned = combined.replace(/[^a-zA-Z0-9]/g, '')
    return cleaned.substring(0, 20) || 'database'
  }, [tables])

  // Handle push to remote (Build Database)
  const handlePushToRemote = useCallback(async () => {
    setIsPushing(true)
    setPushStartTime(Date.now())
    setPushProgress('Starting...')
    setPushResult(null)
    setFallbackMessage(null)
    setError(null)

    try {
      // Determine storage tier - check limits BEFORE upload if persistent requested
      const storageTier = getEffectiveStorageTier(keepPersistent)

      // Admin role bypasses all checks (uses permanent storage directory with no limits)
      if (userRole === 'admin') {
        console.log('📤 [BUILD DB] Admin role detected - skipping all validation checks')
      } else {
        // STEP 1: Estimate actual Parquet size (for both unsigned and pro users)
        setPushProgress('Estimating database size...')
        const parquetSizeBytes = await estimateDatabaseSize()
        const parquetSizeMb = parquetSizeBytes / 1024 / 1024
        const estimatedDuckDbMb = parquetSizeMb * 2

        console.log('📤 [BUILD DB] Size estimation:', {
          parquetSize: `${parquetSizeMb.toFixed(1)} MB`,
          estimatedDuckDb: `${estimatedDuckDbMb.toFixed(1)} MB`
        })

        // STEP 2: File size check (both unsigned and pro)
        if (estimatedDuckDbMb > 75) {
          setError(`Database too large: ~${estimatedDuckDbMb.toFixed(1)} MB. Maximum allowed: 75 MB. Try reducing data or removing tables.`)
          setIsPushing(false)
          setPushProgress('')
          return
        }

        // STEP 3: Pro user checks (file count + available space)
        if (keepPersistent && isAllowed && user?.email && storageTier !== 'temp') {
          // File count check
          const limits = await getEffectiveLimits(user.email)
          const validation = await validateUpload(user.email, 0, limits)

          if (!validation.allowed) {
            setFileLimitInfo({
              userFileCount: validation.userFileCount || 0,
              maxFiles: validation.maxFiles || 2
            })
            setShowFileLimitModal(true)
            setIsPushing(false)
            setPushProgress('')
            return
          }

          // Available space check
          console.log('📤 [BUILD DB] Checking persistent storage capacity...')
          const storageStatus = await getStorageStatus('persistent')
          if (storageStatus) {
            console.log('📤 [BUILD DB] Storage check:', {
              available: storageStatus.available_mb,
              estimatedSize: estimatedDuckDbMb
            })

            if (estimatedDuckDbMb > storageStatus.available_mb || !storageStatus.can_upload) {
              console.log('📤 [BUILD DB] Storage FULL - showing modal')
              setStorageInfo({
                usedMb: 0,
                maxMb: storageStatus.available_mb,
                fileSizeMb: estimatedDuckDbMb
              })
              setShowStorageFullModal(true)
              setIsPushing(false)
              setPushProgress('')
              return
            }
          }
        }
      }

      // Use table names to generate a meaningful database name
      const dbName = generateDbDisplayName()
      const result = await pushToRemote(dbName, (progress) => {
        setPushProgress(progress.message)
      }, storageTier)

      if (result.success) {
        setPushResult({ downloadUrl: result.downloadUrl, filename: result.filename })
        setUsedPersistentStorage(keepPersistent && isAllowed)

        // Save to Neon if persistent/permanent (not temp)
        if (keepPersistent && isAllowed && user?.email && result.downloadUrl && result.filename) {
          try {
            const fileSizeMb = result.sizeBytes ? result.sizeBytes / 1024 / 1024 : 0
            const displayName = generateDbDisplayName()
            await addFileRecord({
              user_id: user.id,
              user_email: user.email,
              server_filename: result.filename,
              display_name: displayName,
              download_url: result.downloadUrl,
              size_mb: fileSizeMb,
              format: 'duckdb'
            })
            console.log('File record saved to Neon with display name:', displayName)
          } catch (err) {
            console.error('Failed to save file record:', err)
          }
        }
      } else {
        setPushResult({ error: result.error })
        setError(`Push failed: ${result.error}`)
      }
    } catch (err: any) {
      setPushResult({ error: err.message })
      setError(`Push failed: ${err.message}`)
    } finally {
      setIsPushing(false)
      setPushProgress('')
    }
  }, [keepPersistent, isAllowed, user, generateDbDisplayName, getEffectiveStorageTier])

  // Copy URL to clipboard
  const handleCopyUrl = useCallback(async () => {
    if (pushResult?.downloadUrl) {
      await navigator.clipboard.writeText(pushResult.downloadUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [pushResult])

  const handleQuickCopyUrl = useCallback(async () => {
    if (quickUploadResult?.downloadUrl) {
      await navigator.clipboard.writeText(quickUploadResult.downloadUrl)
      setQuickCopied(true)
      setTimeout(() => setQuickCopied(false), 2000)
    }
  }, [quickUploadResult])

  // Download file from remote URL (direct browser download - no memory buffering)
  const handleRemoteDownload = useCallback((
    url: string,
    filename?: string,
    setLoading?: (loading: boolean) => void
  ) => {
    // Show loading state briefly (just to indicate the action was triggered)
    if (setLoading) setLoading(true)

    try {
      // Create anchor element pointing directly to the URL
      // Browser's native download manager takes over immediately
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'database.duckdb'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Remove loading state immediately (browser download manager takes over)
      if (setLoading) {
        setTimeout(() => setLoading(false), 500) // Brief delay for visual feedback
      }
    } catch (err) {
      console.error('Download failed:', err)
      // Fallback: open in new tab
      window.open(url, '_blank')
      if (setLoading) setLoading(false)
    }
  }, [])

  // Download Quick Upload file locally
  const handleQuickDownloadLocal = useCallback(() => {
    if (quickUploadResult?.localFile) {
      const url = URL.createObjectURL(quickUploadResult.localFile)
      const a = document.createElement('a')
      a.href = url
      a.download = quickUploadResult.localFile.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }, [quickUploadResult])

  // Handle CSV to Parquet drop - converts locally first, then offers choice
  const handleParquetDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverParquet(false)
    setError(null)

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      return
    }

    const files = Array.from(e.dataTransfer.files).filter(
      f => /\.(csv|tsv|txt|pipe|psv)$/i.test(f.name)
    )

    if (files.length === 0) {
      setError('Please drop a CSV, TSV, or delimited file')
      return
    }

    if (files.length > 1) {
      setError('CSV → Parquet supports one file at a time')
      return
    }

    const file = files[0]
    setIsConvertingParquet(true)
    setParquetResult(null)
    setParquetStartTime(null)  // Reset timer for new conversion
    setParquetProgress('Converting to Parquet...')

    try {
      // Convert CSV to Parquet in browser
      const { buffer, rowCount } = await convertCsvToParquet(file)
      const parquetFilename = file.name.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '.parquet')

      // Store result with local buffer - user can choose to download locally or upload
      setParquetResult({
        rowCount,
        localBuffer: buffer,
        filename: parquetFilename,
      })
    } catch (err: any) {
      setParquetResult({ error: err.message })
      setError(`Conversion failed: ${err.message}`)
    } finally {
      setIsConvertingParquet(false)
      setParquetProgress('')
    }
  }, [isRoleLoading])

  // Handle CSV to Parquet file input - converts locally first
  const handleParquetFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Wait for role to load before allowing file operations
    if (isRoleLoading) {
      setError('Please wait, loading user permissions...')
      e.target.value = ''
      return
    }

    const file = files[0]
    setError(null)
    setIsConvertingParquet(true)
    setParquetResult(null)
    setParquetStartTime(null)  // Reset timer for new conversion
    setParquetProgress('Converting to Parquet...')

    try {
      // Convert CSV to Parquet in browser
      const { buffer, rowCount } = await convertCsvToParquet(file)
      const parquetFilename = file.name.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '.parquet')

      // Store result with local buffer
      setParquetResult({
        rowCount,
        localBuffer: buffer,
        filename: parquetFilename,
      })
    } catch (err: any) {
      setParquetResult({ error: err.message })
      setError(`Conversion failed: ${err.message}`)
    } finally {
      setIsConvertingParquet(false)
      setParquetProgress('')
      e.target.value = ''
    }
  }, [isRoleLoading])

  // Download Parquet file locally (no upload to server)
  const handleParquetDownloadLocal = useCallback(() => {
    if (parquetResult?.localBuffer && parquetResult?.filename) {
      const blob = new Blob([new Uint8Array(parquetResult.localBuffer)], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = parquetResult.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }, [parquetResult])

  // Upload Parquet to server for shareable link
  const handleParquetUploadToServer = useCallback(async () => {
    if (!parquetResult?.localBuffer || !parquetResult?.filename) return

    const fileSizeMb = parquetResult.localBuffer.length / 1024 / 1024

    // Pre-upload size validation - Admin bypasses all checks
    if (userRole !== 'admin') {
      if (fileSizeMb > 75) {
        setError(`Parquet file too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed: 75 MB`)
        return
      }
    }

    setIsConvertingParquet(true)
    setParquetStartTime(Date.now())
    setParquetProgress('Uploading to server...')
    setFallbackMessage(null)
    setError(null)

    try {
      // Determine storage tier - check limits BEFORE upload if persistent requested
      const storageTier = getEffectiveStorageTier(keepPersistent)

      // Admin role bypasses all checks (uses permanent storage directory with no limits)
      if (userRole === 'admin') {
        console.log('📤 [PARQUET] Admin role detected - skipping all validation checks')
      } else if (keepPersistent && isAllowed && user?.email && storageTier !== 'temp') {
        // Pre-upload validation: check if persistent storage is available
        const limits = await getEffectiveLimits(user.email)
        const validation = await validateUpload(user.email, fileSizeMb, limits)

        if (!validation.allowed) {
          // Show file limit modal instead of fallback
          setFileLimitInfo({
            userFileCount: validation.userFileCount || 0,
            maxFiles: validation.maxFiles || 2
          })
          setShowFileLimitModal(true)
          setIsConvertingParquet(false)
          setParquetProgress('')
          return
        }

        // Check backend storage capacity via serverless proxy
        console.log('📤 [PARQUET] Checking backend storage capacity...')
        const storageStatus = await getStorageStatus('persistent')
        if (storageStatus) {
          // Parquet × 2 for estimated DuckDB size
          const estimatedFileSizeMb = fileSizeMb * 2

          console.log('📤 [PARQUET] Storage check:', {
            available: storageStatus.available_mb,
            fileSize: fileSizeMb,
            estimatedSize: estimatedFileSizeMb
          })

          if (estimatedFileSizeMb > storageStatus.available_mb || !storageStatus.can_upload) {
            // Show storage full modal
            console.log('📤 [PARQUET] Storage FULL - showing modal')
            setStorageInfo({
              usedMb: 0,
              maxMb: storageStatus.available_mb,
              fileSizeMb: estimatedFileSizeMb
            })
            setShowStorageFullModal(true)
            setIsConvertingParquet(false)
            setParquetProgress('')
            return
          }
        }
      }

      const result = await uploadParquetBuffer(parquetResult.localBuffer, parquetResult.filename, (progress) => {
        setParquetProgress(progress.message)
      }, storageTier)

      if (result.success) {
        setParquetResult({
          ...parquetResult,
          downloadUrl: result.downloadUrl,
        })
        setUsedPersistentStorage(keepPersistent && isAllowed)

        // Save to Neon if persistent/permanent (not temp)
        if (keepPersistent && isAllowed && user?.email && result.downloadUrl && result.filename) {
          try {
            await addFileRecord({
              user_id: user.id,
              user_email: user.email,
              server_filename: result.filename,
              display_name: parquetResult.filename.replace(/\.parquet$/i, ''),
              download_url: result.downloadUrl,
              size_mb: fileSizeMb,
              format: 'parquet'
            })
            console.log('File record saved to Neon')
          } catch (err) {
            console.error('Failed to save file record:', err)
          }
        }
      } else {
        setError(`Upload failed: ${result.error}`)
      }
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`)
    } finally {
      setIsConvertingParquet(false)
      setParquetProgress('')
    }
  }, [parquetResult, keepPersistent, isAllowed, user, getEffectiveStorageTier])

  // Copy Parquet URL to clipboard
  const handleParquetCopyUrl = useCallback(async () => {
    if (parquetResult?.downloadUrl) {
      await navigator.clipboard.writeText(parquetResult.downloadUrl)
      setParquetCopied(true)
      setTimeout(() => setParquetCopied(false), 2000)
    }
  }, [parquetResult])

  // Format cell value for display
  const formatCellValue = (value: any, colType: string): string => {
    if (value === null || value === undefined) return ''

    if (colType === 'DATE' || colType === 'TIMESTAMP') {
      const date = typeof value === 'number' ? new Date(value) : new Date(value)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }

    return String(value)
  }

  return (
    <main className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Error Display */}
        {error && (
          <div
            className="mb-6 p-3 rounded-lg text-base font-medium"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' }}
          >
            {error}
          </div>
        )}

        {/* Main Content - Two Independent Columns */}
        <div className="flex flex-col lg:flex-row gap-5">

          {/* LEFT COLUMN - stacks vertically */}
          <div className="flex-1 flex flex-col gap-5">

            {/* Build Database */}
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2" style={{ color: '#000000' }}>
                <Database className="w-5 h-5" style={{ color: '#DC2626' }} />
                Build Database
              </h2>
              <p className="text-base font-medium mb-3" style={{ color: '#000000' }}>
                Drop CSV/TSV files to create a DuckDB database with multiple tables
              </p>

              {/* Drop Zone */}
              <div
                className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                  isDragOverBuild ? 'ring-2 ring-offset-2 ring-red-600' : ''
                }`}
                style={{
                  backgroundColor: isDragOverBuild ? 'rgba(220, 38, 38, 0.05)' : '#FFFFFF',
                  border: `2px dashed ${isDragOverBuild ? '#DC2626' : '#E2E8F0'}`,
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverBuild(true) }}
                onDragLeave={() => setIsDragOverBuild(false)}
                onDrop={handleBuildDrop}
                onClick={() => document.getElementById('build-file-input')?.click()}
              >
                <input
                  id="build-file-input"
                  type="file"
                  accept=".csv,.tsv,.txt,.pipe,.psv"
                  multiple
                  className="hidden"
                  onChange={handleBuildFileInput}
                  disabled={isInitializing || isImporting}
                />

                {isInitializing ? (
                  <>
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: '#DC2626' }} />
                    <p className="text-base font-medium" style={{ color: '#000000' }}>
                      Initializing DuckDB...
                    </p>
                  </>
                ) : isImporting ? (
                  <>
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: '#DC2626' }} />
                    <p className="text-base font-medium" style={{ color: '#000000' }}>
                      Importing files...
                    </p>
                  </>
                ) : isPushing ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#DC2626' }} />
                      <span className="text-base font-medium" style={{ color: '#000000' }}>
                        {pushProgress || 'Uploading...'}
                      </span>
                    </div>
                    <span className="font-mono text-lg tabular-nums font-semibold" style={{ color: '#000000' }}>{pushTimer.formatted}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: '#000000' }} />
                    <p className="text-base font-semibold" style={{ color: '#000000' }}>
                      Drop CSV/TSV files here
                    </p>
                    <p className="text-sm font-medium" style={{ color: '#000000' }}>
                      or click to browse • Multiple files = multiple tables
                    </p>
                  </>
                )}
              </div>

              {/* Tables List */}
              {tables.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-base font-bold mb-2 flex items-center gap-2" style={{ color: '#000000' }}>
                    Tables ({tables.length})
                  </h3>
                  <div className="space-y-2">
                    {tables.map((table) => (
                      <div
                        key={table.name}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
                      >
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4" style={{ color: '#000000' }} />
                          <span className="font-semibold" style={{ color: '#000000' }}>
                            {table.name}
                          </span>
                          <span className="text-sm" style={{ color: '#000000' }}>
                            {table.rowCount.toLocaleString()} rows
                          </span>
                        </div>
                        <button
                          onClick={() => openTableInfo(table)}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                          title="View table info"
                        >
                          <Info className="w-4 h-4" style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4">
                    {pushResult?.downloadUrl ? (
                      <div className="space-y-3">
                        {/* Shareable URL */}
                        <div className="p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                          <p className="text-base font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                            <Check className="w-4 h-4" style={{ color: '#22C55E' }} />
                            Upload succeeded! Shareable URL below • Link valid {userRole === 'admin' && usedPersistentStorage ? 'permanently' : usedPersistentStorage ? '7 days' : '24 hours'}
                          </p>
                          <p className="text-base font-medium mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                            <Clock className="w-4 h-4" style={{ color: '#166534' }} />
                            Time: {formatTimerSimple(pushTimer.formatted)}
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={pushResult.downloadUrl}
                              className="flex-1 text-sm p-2 rounded border bg-gray-50 font-mono"
                              style={{ borderColor: '#E2E8F0', color: '#000000' }}
                            />
                            <button
                              onClick={handleCopyUrl}
                              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                              title="Copy URL"
                            >
                              {copied ? (
                                <Check className="w-5 h-5" style={{ color: '#22C55E' }} />
                              ) : (
                                <Copy className="w-5 h-5" style={{ color: '#64748B' }} />
                              )}
                            </button>
                          </div>
                          {/* Fallback message when persistent storage full */}
                          {fallbackMessage && (
                            <p className="text-base font-medium mt-2" style={{ color: '#B45309' }}>
                              {fallbackMessage}
                            </p>
                          )}
                        </div>

                        {/* Action buttons - full width */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRemoteDownload(pushResult.downloadUrl!, pushResult.filename || 'database.duckdb', setIsDownloadingBuild)}
                            disabled={isDownloadingBuild}
                            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all border flex items-center justify-center gap-1.5 ${
                              isDownloadingBuild
                                ? 'bg-blue-50 border-blue-300 text-blue-700 cursor-wait'
                                : 'bg-white hover:bg-slate-100 active:bg-slate-200 border-slate-300 text-black'
                            }`}
                            title="Download the DuckDB file from server"
                          >
                            {isDownloadingBuild ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            {isDownloadingBuild ? 'Downloading...' : 'Download'}
                          </button>
                          <button
                            onClick={() => { setPushResult(null); setFallbackMessage(null); setUsedPersistentStorage(false) }}
                            className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                            title="Clear and start fresh"
                          >
                            Start Over
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Storage info for unauthenticated users */}
                        {!user && (
                          <p className="text-base font-medium" style={{ color: '#000000' }}>
                            Default link valid 24 hours, no sign-up required.
                          </p>
                        )}

                        {/* Keep Persistent Checkbox */}
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={keepPersistent}
                              disabled={!isAllowed}
                              onChange={(e) => {
                                setKeepPersistent(e.target.checked)
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                            />
                            <span className="text-base font-medium" style={{ color: isAllowed ? '#000000' : '#94A3B8' }}>
                              {userRole === 'admin' ? 'Keep permanent' : 'Keep persistent'}{!user ? ' (7-day, sign-up required)' : ''}
                            </span>
                            {isAllowed && (
                              <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                                {userStorageTier === 'permanent' ? 'Permanent' : userStorageTier === 'persistent' ? '7-day' : 'Enabled'}
                              </span>
                            )}
                            {!user && (
                              <Lock className="w-4 h-4" style={{ color: '#94A3B8' }} />
                            )}
                          </label>
                          {user && !isAllowed && (
                            <p className="text-base font-medium ml-6" style={{ color: '#000000' }}>
                              Sign up required - contact <a href="mailto:amar@harolikar.com" className="underline" style={{ color: '#DC2626' }}>amar@harolikar.com</a> for access
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handlePushToRemote}
                            disabled={isPushing}
                            className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black disabled:opacity-50 disabled:hover:bg-white"
                            title="Upload to server and get a shareable URL (expires in 48h)"
                          >
                            <Upload className="w-4 h-4 inline mr-2" />
                            Get Shareable Link
                          </button>
                          <button
                            disabled
                            className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white border border-slate-300 text-black cursor-not-allowed opacity-50"
                            title="Click 'Get Shareable Link' first to upload, then download the .duckdb file"
                          >
                            <Download className="w-4 h-4 inline mr-2" />
                            Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>{/* End Build Database box */}

            {/* CSV → Parquet (in left column) */}
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2" style={{ color: '#000000' }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: '#DC2626' }} />
                CSV → Parquet
              </h2>
              <p className="text-base font-medium mb-3" style={{ color: '#000000' }}>
                Convert CSV/TSV to Parquet format (browser-based, up to ~1.5GB)
              </p>

              {/* Drop Zone */}
              <div
                className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                  isDragOverParquet ? 'ring-2 ring-offset-2 ring-red-600' : ''
                }`}
                style={{
                  backgroundColor: isDragOverParquet ? 'rgba(220, 38, 38, 0.05)' : '#FFFFFF',
                  border: `2px dashed ${isDragOverParquet ? '#DC2626' : '#E2E8F0'}`,
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverParquet(true) }}
                onDragLeave={() => setIsDragOverParquet(false)}
                onDrop={handleParquetDrop}
                onClick={() => document.getElementById('parquet-file-input')?.click()}
              >
                <input
                  id="parquet-file-input"
                  type="file"
                  accept=".csv,.tsv,.txt,.pipe,.psv"
                  className="hidden"
                  onChange={handleParquetFileInput}
                  disabled={isConvertingParquet}
                />

                {isConvertingParquet ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#DC2626' }} />
                      <span className="text-base font-medium" style={{ color: '#000000' }}>
                        {parquetProgress || 'Processing...'}
                      </span>
                    </div>
                    {/* Only show timer during upload phase, not conversion */}
                    {parquetStartTime && (
                      <span className="font-mono text-lg tabular-nums font-semibold" style={{ color: '#000000' }}>{parquetTimer.formatted}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2" style={{ color: '#000000' }} />
                    <p className="text-base font-semibold" style={{ color: '#000000' }}>
                      Drop CSV/TSV file here
                    </p>
                    <p className="text-sm font-medium" style={{ color: '#000000' }}>
                      or click to browse • Single file only
                    </p>
                  </>
                )}
              </div>

              {/* Parquet Result */}
              {parquetResult?.localBuffer && !parquetResult?.error && (
                <div className="mt-4 space-y-3">
                  <div
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 flex-shrink-0" style={{ color: '#22C55E' }} />
                      <span className="text-sm font-medium" style={{ color: '#166534' }}>
                        Converted! {parquetResult.rowCount?.toLocaleString()} rows • ~{(parquetResult.localBuffer!.length / 1024 / 1024).toFixed(2)} MB → {parquetResult.filename}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {!parquetResult.downloadUrl && (
                    <div className="space-y-3">
                      {/* Storage info for unauthenticated users */}
                      {!user && (
                        <p className="text-base font-medium" style={{ color: '#000000' }}>
                          Default link valid 24 hours, no sign-up required.
                        </p>
                      )}

                      {/* Keep Persistent Checkbox */}
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={keepPersistent}
                            disabled={!isAllowed}
                            onChange={(e) => {
                              setKeepPersistent(e.target.checked)
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                          />
                          <span className="text-base font-medium" style={{ color: isAllowed ? '#000000' : '#94A3B8' }}>
                            {userRole === 'admin' ? 'Keep permanent' : 'Keep persistent'}{!user ? ' (7-day, sign-up required)' : ''}
                          </span>
                          {isAllowed && (
                            <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                              {userStorageTier === 'permanent' ? 'Permanent' : userStorageTier === 'persistent' ? '7-day' : 'Enabled'}
                            </span>
                          )}
                          {!user && (
                            <Lock className="w-4 h-4" style={{ color: '#94A3B8' }} />
                          )}
                        </label>
                        {user && !isAllowed && (
                          <p className="text-base font-medium ml-6" style={{ color: '#000000' }}>
                            Sign up required - contact <a href="mailto:amar@harolikar.com" className="underline" style={{ color: '#DC2626' }}>amar@harolikar.com</a> for access
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleParquetUploadToServer}
                          disabled={isConvertingParquet}
                          className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black disabled:opacity-50 disabled:hover:bg-white"
                          title="Upload to server and get a shareable URL (expires in 48h)"
                        >
                          <Upload className="w-4 h-4 inline mr-2" />
                          Get Shareable Link
                        </button>
                        <button
                          onClick={handleParquetDownloadLocal}
                          className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                          title="File already converted in browser - download directly to your device"
                        >
                          <Download className="w-4 h-4 inline mr-2" />
                          Download
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Remote URL Result */}
                  {parquetResult.downloadUrl && (
                    <>
                      <div className="p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                        <p className="text-base font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                          <Check className="w-4 h-4" style={{ color: '#22C55E' }} />
                          Upload succeeded! Shareable URL below • Link valid {userRole === 'admin' && usedPersistentStorage ? 'permanently' : usedPersistentStorage ? '7 days' : '24 hours'}
                        </p>
                        <p className="text-base font-medium mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                          <Clock className="w-4 h-4" style={{ color: '#166534' }} />
                          Time: {formatTimerSimple(parquetTimer.formatted)}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={parquetResult.downloadUrl}
                            className="flex-1 text-sm p-2 rounded border bg-gray-50 font-mono"
                            style={{ borderColor: '#E2E8F0', color: '#000000' }}
                          />
                          <button
                            onClick={handleParquetCopyUrl}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Copy URL"
                          >
                            {parquetCopied ? (
                              <Check className="w-5 h-5" style={{ color: '#22C55E' }} />
                            ) : (
                              <Copy className="w-5 h-5" style={{ color: '#64748B' }} />
                            )}
                          </button>
                        </div>
                        {/* Fallback message when persistent storage full */}
                        {fallbackMessage && (
                          <p className="text-base font-medium mt-2" style={{ color: '#B45309' }}>
                            {fallbackMessage}
                          </p>
                        )}
                      </div>

                      {/* Action buttons - full width */}
                      <div className="flex gap-2">
                        <button
                          onClick={handleParquetDownloadLocal}
                          className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black flex items-center justify-center gap-1.5"
                          title="File already converted in browser - download directly to your device"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          onClick={() => { setParquetResult(null); setParquetStartTime(null); setFallbackMessage(null); setUsedPersistentStorage(false) }}
                          className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                          title="Clear and convert a new CSV file"
                        >
                          Convert Another
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>{/* End LEFT COLUMN */}

          {/* RIGHT COLUMN - stacks vertically */}
          <div className="flex-1 flex flex-col gap-5">

            {/* Quick Upload */}
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
            >
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2" style={{ color: '#000000' }}>
                <FileUp className="w-5 h-5" style={{ color: '#DC2626' }} />
                Quick Upload
              </h2>
              <p className="text-base font-medium mb-3" style={{ color: '#000000' }}>
                Already have a Parquet or DuckDB file? Upload directly for a shareable link
              </p>

              {/* Drop Zone */}
              <div
                className={`rounded-lg p-4 text-center transition-all cursor-pointer ${
                  isDragOverQuick ? 'ring-2 ring-offset-2 ring-red-600' : ''
                }`}
                style={{
                  backgroundColor: isDragOverQuick ? 'rgba(220, 38, 38, 0.05)' : '#FFFFFF',
                  border: `2px dashed ${isDragOverQuick ? '#DC2626' : '#E2E8F0'}`,
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverQuick(true) }}
                onDragLeave={() => setIsDragOverQuick(false)}
                onDrop={handleQuickDrop}
                onClick={() => document.getElementById('quick-file-input')?.click()}
              >
                <input
                  id="quick-file-input"
                  type="file"
                  accept=".parquet,.duckdb,.db"
                  className="hidden"
                  onChange={handleQuickFileInput}
                  disabled={isQuickUploading}
                />

                {isQuickUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#DC2626' }} />
                      <span className="text-base font-medium" style={{ color: '#000000' }}>
                        {quickUploadProgress || 'Uploading...'}
                      </span>
                    </div>
                    <span className="font-mono text-lg tabular-nums font-semibold" style={{ color: '#000000' }}>{quickUploadTimer.formatted}</span>
                  </div>
                ) : (
                  <>
                    <FileUp className="w-8 h-8 mx-auto mb-2" style={{ color: '#000000' }} />
                    <p className="text-base font-semibold" style={{ color: '#000000' }}>
                      Drop Parquet or DuckDB file
                    </p>
                    <p className="text-sm font-medium" style={{ color: '#000000' }}>
                      or click to browse • One file at a time
                    </p>
                  </>
                )}
              </div>

              {/* Staged File Info - shown below drop zone when file is staged */}
              {quickStagedFile && !quickUploadResult?.downloadUrl && (
                <div className="mt-4 space-y-3">
                  {/* File info row */}
                  <div
                    className="p-3 rounded-lg flex items-center justify-between"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
                  >
                    <div className="flex items-center gap-2">
                      <FileUp className="w-5 h-5" style={{ color: '#22C55E' }} />
                      <span className="text-base font-semibold" style={{ color: '#000000' }}>
                        {quickStagedFile.name}
                      </span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: '#000000' }}>
                      ~{(quickStagedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>

                  {/* Storage info for unauthenticated users */}
                  {!user && (
                    <p className="text-base font-medium" style={{ color: '#000000' }}>
                      Default link valid 24 hours, no sign-up required.
                    </p>
                  )}

                  {/* Keep Persistent Checkbox */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={keepPersistentQuick}
                        disabled={!isAllowed}
                        onChange={(e) => setKeepPersistentQuick(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                      />
                      <span className="text-base font-medium" style={{ color: isAllowed ? '#000000' : '#94A3B8' }}>
                        {userRole === 'admin' ? 'Keep permanent' : 'Keep persistent'}{!user ? ' (7-day, sign-up required)' : ''}
                      </span>
                      {isAllowed && (
                        <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                          {userStorageTier === 'permanent' ? 'Permanent' : userStorageTier === 'persistent' ? '7-day' : 'Enabled'}
                        </span>
                      )}
                      {!user && (
                        <Lock className="w-4 h-4" style={{ color: '#94A3B8' }} />
                      )}
                    </label>
                    {user && !isAllowed && (
                      <p className="text-base font-medium ml-6" style={{ color: '#000000' }}>
                        Sign up required - contact <a href="mailto:amar@harolikar.com" className="underline" style={{ color: '#DC2626' }}>amar@harolikar.com</a> for access
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleQuickUpload}
                      className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                    >
                      <Upload className="w-4 h-4 inline mr-2" />
                      Get Shareable Link
                    </button>
                    <button
                      onClick={handleQuickClearStaged}
                      className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Upload Result */}
              {quickUploadResult?.downloadUrl && (
                <div className="mt-4 space-y-3">
                  {/* Shareable URL */}
                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                    <p className="text-base font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                      <Check className="w-4 h-4" style={{ color: '#22C55E' }} />
                      Upload succeeded! Shareable URL below • Link valid {userRole === 'admin' && usedPersistentStorage ? 'permanently' : usedPersistentStorage ? '7 days' : '24 hours'}
                    </p>
                    <p className="text-base font-medium mb-2 flex items-center gap-1.5" style={{ color: '#166534' }}>
                      <Clock className="w-4 h-4" style={{ color: '#166534' }} />
                      Time: {formatTimerSimple(quickUploadTimer.formatted)}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={quickUploadResult.downloadUrl}
                        className="flex-1 text-sm p-2 rounded border bg-gray-50 font-mono"
                        style={{ borderColor: '#E2E8F0', color: '#000000' }}
                      />
                      <button
                        onClick={handleQuickCopyUrl}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Copy URL"
                      >
                        {quickCopied ? (
                          <Check className="w-5 h-5" style={{ color: '#22C55E' }} />
                        ) : (
                          <Copy className="w-5 h-5" style={{ color: '#64748B' }} />
                        )}
                      </button>
                    </div>
                    {/* Fallback message when persistent storage full */}
                    {fallbackMessage && (
                      <p className="text-base font-medium mt-2" style={{ color: '#B45309' }}>
                        {fallbackMessage}
                      </p>
                    )}
                  </div>

                  {/* Action buttons - full width */}
                  <div className="flex gap-2">
                    {quickUploadResult.localFile && (
                      <button
                        onClick={handleQuickDownloadLocal}
                        className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black flex items-center justify-center gap-1.5"
                        title="File already in browser - download directly to your device"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                    <button
                      onClick={() => { setQuickUploadResult(null); setQuickStagedFile(null); setFallbackMessage(null); setUsedPersistentStorage(false) }}
                      className="flex-1 py-2 px-4 rounded-lg font-semibold transition-all bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-black"
                      title="Clear and upload a new file"
                    >
                      Upload Another
                    </button>
                  </div>
                </div>
              )}
            </div>{/* End Quick Upload box */}

          </div>{/* End RIGHT COLUMN */}

        </div>{/* End Two Columns Container */}

        {/* Service Notes - After all blocks */}
        <div className="mt-5 space-y-1.5">
          <p className="text-base font-medium" style={{ color: '#000000' }}>
            <span className="font-bold">Shareable links:</span> Work like Dropbox (anyone with the link can access). Links use cryptographically signed URLs that expire in 48h. API-authenticated backend. No file browsing access.
          </p>
          <p className="text-base font-medium" style={{ color: '#000000' }}>
            <span className="font-bold">Files:</span> Files auto-delete in 24h, sometimes sooner. Signed-up users get persistent storage with 7-day retention. Limited capacity - files may be deleted without notice. Free service offered in good faith, no guarantees on availability or security.{' '}
            <a
              href="https://github.com/amararun"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
              style={{ color: '#000000' }}
            >
              Open source
            </a>
            {' - deploy your own instance for better privacy.'}
          </p>
        </div>
      </div>

      {/* Table Info Modal */}
      {selectedTable && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: '#E2E8F0' }}
            >
              <div>
                <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
                  {selectedTable.name}
                </h3>
                <p className="text-sm font-medium" style={{ color: '#000000' }}>
                  {selectedTable.rowCount.toLocaleString()} rows • {selectedTable.columns.length} columns
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" style={{ color: '#000000' }} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {/* Column Structure */}
              <div className="mb-6">
                <h4 className="text-base font-bold mb-2" style={{ color: '#000000' }}>
                  Structure
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedTable.columns.map((col, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}
                    >
                      <span className="font-medium" style={{ color: '#000000' }}>{col.name}</span>
                      <span className="text-sm" style={{ color: '#000000' }}>{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample Rows */}
              <div>
                <h4 className="text-base font-bold mb-2" style={{ color: '#000000' }}>
                  Sample Rows (first 10)
                </h4>
                {isLoadingSample ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#DC2626' }} />
                  </div>
                ) : sampleRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: '#FFFFFF' }}>
                          {selectedTable.columns.map((col, i) => (
                            <th
                              key={i}
                              className="text-left p-2 font-semibold whitespace-nowrap"
                              style={{ color: '#000000', borderBottom: '1px solid #E2E8F0' }}
                            >
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {selectedTable.columns.map((col, colIdx) => (
                              <td
                                key={colIdx}
                                className="p-2 whitespace-nowrap"
                                style={{ color: '#000000', borderBottom: '1px solid #E2E8F0' }}
                              >
                                {formatCellValue(row[col.name], col.type)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-4" style={{ color: '#000000' }}>
                    No data available
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Limit Modal */}
      {showFileLimitModal && fileLimitInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: '#000000' }}>File Limit Reached</h2>
              <button
                onClick={() => setShowFileLimitModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" style={{ color: '#000000' }} />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-base font-medium mb-3" style={{ color: '#000000' }}>
                You have {fileLimitInfo.userFileCount}/{fileLimitInfo.maxFiles} persistent files.
              </p>
              <p className="text-base" style={{ color: '#000000' }}>
                To upload with persistent storage, please delete some existing files first, or uncheck "Keep persistent" to upload with a 24-hour temporary link.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowFileLimitModal(false)
                  // Dispatch event to open My Files modal
                  window.dispatchEvent(new CustomEvent('openMyFiles'))
                }}
                className="w-full py-3 px-4 font-semibold rounded-lg transition-colors"
                style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
              >
                Go to My Files
              </button>
              <button
                onClick={() => setShowFileLimitModal(false)}
                className="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 font-medium rounded-lg transition-colors"
                style={{ color: '#000000' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Full Modal */}
      {showStorageFullModal && storageInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: '#000000' }}>Server Storage Full</h2>
              <button
                onClick={() => setShowStorageFullModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" style={{ color: '#000000' }} />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-base font-medium mb-3" style={{ color: '#000000' }}>
                The overall server capacity for persistent storage is currently full.
              </p>
              <p className="text-base mb-3" style={{ color: '#000000' }}>
                Your file ({storageInfo.fileSizeMb.toFixed(1)} MB) cannot be uploaded with persistent storage at this time.
              </p>
              <p className="text-base" style={{ color: '#000000' }}>
                Please try again later, or uncheck "Keep persistent" to upload with a 24-hour temporary link instead.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowStorageFullModal(false)}
                className="w-full py-3 px-4 font-semibold rounded-lg transition-colors"
                style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
