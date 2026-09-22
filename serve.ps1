$port = 3000
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = "D:\MY PC\Coding\Health Vibe Ai" }
$root = Join-Path $scriptDir "app"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[OK] Health Vibes Web Server is running!" -ForegroundColor Green
Write-Host "[URL] http://localhost:$port" -ForegroundColor Cyan
Write-Host "[ROOT] Serving folder: $root" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

try {
    Start-Process "http://localhost:$port"
} catch {}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }

    try {
        $request = $context.Request
        $response = $context.Response
        $response.AddHeader("Access-Control-Allow-Origin", "*")

        $rawPath = $request.Url.LocalPath
        $localPath = [System.Uri]::UnescapeDataString($rawPath)
        if ($localPath -eq "/" -or $localPath -eq "/app" -or $localPath -eq "/app/") { 
            $localPath = "/index.html" 
        }
        if ($localPath.StartsWith("/app/")) { 
            $localPath = $localPath.Substring(4) 
        }

        $filePath = Join-Path $root $localPath.TrimStart("/").Replace("/", "\")

        # Also check project root as fallback
        if (-not (Test-Path $filePath -PathType Leaf)) {
            $altPath = Join-Path $scriptDir $localPath.TrimStart("/").Replace("/", "\")
            if (Test-Path $altPath -PathType Leaf) {
                $filePath = $altPath
            }
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                ".ico"  { "image/x-icon" }
                ".mp4"  { "video/mp4" }
                ".webm" { "video/webm" }
                ".woff2"{ "font/woff2" }
                ".woff" { "font/woff" }
                default { "application/octet-stream" }
            }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
    } catch {
        # Catch and continue so listener never crashes
    } finally {
        try {
            $response.OutputStream.Close()
        } catch {}
    }
}
