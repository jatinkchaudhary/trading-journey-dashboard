param([int]$Port = 4173)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $relative = $context.Request.Url.AbsolutePath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
        $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
        if (-not $path.StartsWith([IO.Path]::GetFullPath($root)) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $context.Response.StatusCode = 404; $context.Response.Close(); continue
        }
        $mime = switch ([IO.Path]::GetExtension($path)) { '.html' {'text/html'} '.css' {'text/css'} '.js' {'text/javascript'} '.json' {'application/json'} default {'application/octet-stream'} }
        $bytes = [IO.File]::ReadAllBytes($path)
        $context.Response.ContentType = "$mime; charset=utf-8"
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
        $context.Response.Close()
    }
} finally { $listener.Stop() }
