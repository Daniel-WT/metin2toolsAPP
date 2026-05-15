$shell = Get-Content -Path "index-shell.html" -Raw -Encoding UTF8
$pattern = '(?i)<!-- INJECT: (.*?) -->\s*<div id="tab-.*?-container"></div>'
$matches = [regex]::Matches($shell, $pattern)

foreach ($m in $matches) {
    $filePath = $m.Groups[1].Value.Trim()
    if (Test-Path $filePath) {
        $content = Get-Content -Path $filePath -Raw -Encoding UTF8
        $shell = $shell.Replace($m.Groups[0].Value, $content)
        Write-Host "Injected $filePath"
    } else {
        Write-Host "Warning: $filePath not found!"
    }
}

Set-Content -Path "index.html" -Value $shell -Encoding UTF8
Write-Host "✅ Build complet: index.html a fost asamblat din componente!"
