import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
}

export async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()

  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  return db
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!db) {
    await initDuckDB()
  }
  if (!conn) {
    conn = await db!.connect()
  }
  return conn
}

export async function resetDuckDB(): Promise<void> {
  if (conn) {
    await conn.close()
    conn = null
  }
  if (db) {
    await db.terminate()
    db = null
  }
}

export interface TableInfo {
  name: string
  rowCount: number
  columns: { name: string; type: string }[]
}

export async function getTables(): Promise<TableInfo[]> {
  const connection = await getConnection()

  // Get all tables in main schema
  const tablesResult = await connection.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'main' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)

  const tables: TableInfo[] = []
  const tableNames = tablesResult.toArray().map((row: any) => row.table_name)

  for (const tableName of tableNames) {
    // Get row count
    const countResult = await connection.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
    const rowCount = Number(countResult.toArray()[0].cnt)

    // Get column info
    const columnsResult = await connection.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'main' AND table_name = '${tableName}'
      ORDER BY ordinal_position
    `)
    const columns = columnsResult.toArray().map((row: any) => ({
      name: row.column_name,
      type: row.data_type
    }))

    tables.push({ name: tableName, rowCount, columns })
  }

  return tables
}

export async function getSampleRows(tableName: string, limit: number = 10): Promise<any[]> {
  const connection = await getConnection()
  const result = await connection.query(`SELECT * FROM "${tableName}" LIMIT ${limit}`)
  return result.toArray()
}

/**
 * Detect delimiter from file content (same logic as SQL Rooms)
 */
async function detectDelimiter(file: File): Promise<string> {
  // Read first few KB to detect delimiter
  const slice = file.slice(0, 8192)
  const text = await slice.text()
  const firstLine = text.split('\n')[0] || ''

  const pipeCount = (firstLine.match(/\|/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length

  // Return the most common delimiter
  if (pipeCount > 0 && pipeCount >= tabCount && pipeCount >= commaCount) {
    return '|'
  } else if (tabCount > 0 && tabCount >= commaCount) {
    return '\t'
  }
  return ','  // Default to comma
}

export async function importCSV(file: File, tableName: string): Promise<void> {
  const db = await initDuckDB()
  const connection = await getConnection()

  // Register file in DuckDB's virtual file system
  await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)

  // Detect delimiter based on file extension and content (same as SQL Rooms)
  const fileExtension = file.name.toLowerCase().split('.').pop()
  let delimiter: string

  if (fileExtension === 'pipe' || fileExtension === 'psv') {
    delimiter = '|'
  } else if (fileExtension === 'tsv') {
    delimiter = '\t'
  } else if (fileExtension === 'txt') {
    // Auto-detect from content
    delimiter = await detectDelimiter(file)
  } else {
    // CSV - auto-detect from content as well
    delimiter = await detectDelimiter(file)
  }

  // Create table from CSV with:
  // - auto_detect=true: auto-detect column types
  // - sample_size=-1: scan ENTIRE file for type detection (prevents type errors like "2020/21" in BIGINT column)
  // - delim: explicit delimiter
  const escapedDelim = delimiter === '\t' ? '\\t' : delimiter
  await connection.query(`
    CREATE OR REPLACE TABLE "${tableName}" AS
    SELECT * FROM read_csv('${file.name}', auto_detect=true, sample_size=-1, delim='${escapedDelim}')
  `)
}

export async function exportToParquet(): Promise<Uint8Array> {
  const db = await initDuckDB()
  const connection = await getConnection()

  const outputFile = 'export.parquet'

  // Export all tables to a single parquet file using UNION ALL
  const tables = await getTables()
  if (tables.length === 0) {
    throw new Error('No tables to export')
  }

  // For single table, just export it
  if (tables.length === 1) {
    await connection.query(`COPY "${tables[0].name}" TO '${outputFile}' (FORMAT PARQUET)`)
  } else {
    // For multiple tables, we'll export as DuckDB instead
    throw new Error('Multiple tables - use exportToDuckDB instead')
  }

  const buffer = await db.copyFileToBuffer(outputFile)
  return buffer
}

/**
 * Convert a single CSV file to Parquet in the browser
 * Returns the Parquet file as a Uint8Array buffer
 */
export async function convertCsvToParquet(file: File): Promise<{ buffer: Uint8Array; rowCount: number }> {
  const database = await initDuckDB()
  const connection = await getConnection()

  // Use a temporary table name
  const tempTableName = '_temp_csv_to_parquet_'
  const outputFile = `${file.name.replace(/\.(csv|tsv|txt|pipe|psv)$/i, '')}.parquet`

  // Register file in DuckDB's virtual file system
  await database.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)

  // Detect delimiter
  const fileExtension = file.name.toLowerCase().split('.').pop()
  let delimiter: string

  if (fileExtension === 'pipe' || fileExtension === 'psv') {
    delimiter = '|'
  } else if (fileExtension === 'tsv') {
    delimiter = '\t'
  } else if (fileExtension === 'txt') {
    delimiter = await detectDelimiter(file)
  } else {
    delimiter = await detectDelimiter(file)
  }

  const escapedDelim = delimiter === '\t' ? '\\t' : delimiter

  // Create temporary table from CSV
  await connection.query(`
    CREATE OR REPLACE TABLE "${tempTableName}" AS
    SELECT * FROM read_csv('${file.name}', auto_detect=true, sample_size=-1, delim='${escapedDelim}')
  `)

  // Get row count
  const countResult = await connection.query(`SELECT COUNT(*) as cnt FROM "${tempTableName}"`)
  const rowCount = Number(countResult.toArray()[0].cnt)

  // Export to Parquet
  await connection.query(`COPY "${tempTableName}" TO '${outputFile}' (FORMAT PARQUET)`)

  // Get the buffer
  const buffer = await database.copyFileToBuffer(outputFile)

  // Clean up - drop temporary table
  await connection.query(`DROP TABLE IF EXISTS "${tempTableName}"`)

  return { buffer, rowCount }
}

/**
 * Estimate the total size of all tables when exported as Parquet files
 * This gives a good estimate of the final DuckDB/ZIP size before upload
 */
export async function estimateDatabaseSize(): Promise<number> {
  const database = await initDuckDB()
  const connection = await getConnection()
  const tables = await getTables()

  if (tables.length === 0) {
    return 0
  }

  let totalSize = 0

  // Export each table to parquet and measure size
  for (const table of tables) {
    const fileName = `_estimate_${table.name}.parquet`
    await connection.query(`COPY "${table.name}" TO '${fileName}' (FORMAT PARQUET)`)
    const buffer = await database.copyFileToBuffer(fileName)
    totalSize += buffer.length
  }

  return totalSize
}

export async function exportToDuckDB(): Promise<Uint8Array> {
  const db = await initDuckDB()
  const conn = await getConnection()
  const tables = await getTables()

  if (tables.length === 0) {
    throw new Error('No tables to export')
  }

  // Import JSZip dynamically
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Export each table as Parquet
  for (const table of tables) {
    const fileName = `${table.name}.parquet`
    await conn.query(`COPY "${table.name}" TO '${fileName}' (FORMAT PARQUET)`)
    const buffer = await db.copyFileToBuffer(fileName)
    zip.file(fileName, buffer)
  }

  // Add manifest
  const manifest = {
    tables: tables.map(t => ({ name: t.name, files: [`${t.name}.parquet`], rowCount: t.rowCount })),
    chunked: false
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  // Add schema.sql
  const schemaStatements = tables.map(t => {
    const columns = t.columns.map(c => `"${c.name}" ${c.type}`).join(',\n  ')
    return `CREATE TABLE "${t.name}" (\n  ${columns}\n);`
  })
  zip.file('schema.sql', schemaStatements.join('\n\n'))

  // Generate compressed ZIP
  const zipBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  })

  return zipBuffer
}

export { duckdb }
