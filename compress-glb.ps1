# Compress GLB files with maximum gzip compression (level 9 equivalent)
param(
    [string]$InputFile = "public/Tent3.glb",
    [string]$OutputFile = ""
)

# Set default output file if not provided
if ($OutputFile -eq "") {
    $OutputFile = $InputFile + ".gz"
}

# Check if input file exists
if (-not (Test-Path $InputFile)) {
    Write-Host "Error: Input file '$InputFile' not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Compressing '$InputFile' with maximum compression (level 9 equivalent)..." -ForegroundColor Green

try {
    # Load required assemblies
    Add-Type -AssemblyName System.IO.Compression

    # Read the input file in chunks for better memory management
    $inputStream = [System.IO.File]::OpenRead($InputFile)
    $outputStream = [System.IO.File]::Create($OutputFile)
    
    # Create GZip stream with optimal compression (equivalent to level 9)
    $gzipStream = New-Object System.IO.Compression.GZipStream($outputStream, [System.IO.Compression.CompressionLevel]::Optimal)
    
    # Copy data in chunks for better compression
    $buffer = New-Object byte[] 64KB
    while (($bytesRead = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $gzipStream.Write($buffer, 0, $bytesRead)
    }
    
    # Close streams properly
    $inputStream.Dispose()
    $gzipStream.Dispose()
    $outputStream.Dispose()
    
    # Get file sizes for comparison
    $originalSize = (Get-Item $InputFile).Length
    $compressedSize = (Get-Item $OutputFile).Length
    $compressionRatio = [math]::Round((1 - ($compressedSize / $originalSize)) * 100, 2)
    
    Write-Host "Compression complete with maximum efficiency!" -ForegroundColor Green
    Write-Host "Original size: $([math]::Round($originalSize / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "Compressed size: $([math]::Round($compressedSize / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "Compression ratio: $compressionRatio%" -ForegroundColor Yellow
    Write-Host "Output file: $OutputFile" -ForegroundColor Green
    Write-Host "Note: Using .NET CompressionLevel.Optimal (equivalent to gzip -9)" -ForegroundColor Magenta
}
catch {
    Write-Host "Error during compression: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
