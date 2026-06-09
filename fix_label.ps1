$file = "F:\ard-al-mubarak-erp-96235b20\src\lib\erpFormat.ts"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$oldText = 'asset: "Ø£ØµÙ„", liability: "Ø§Ù„ØªØ²Ø§Ù…", equity: "Ø­Ù‚ÙˆÙ‚ Ù…Ù„ÙƒÙŠØ©", revenue: "Ø¥ÙŠØ±Ø§Ø¯", expense: "Ù…ØµØ±ÙˆÙ"'
$newText = 'asset: "أصل", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف"'
$content = $content.Replace($oldText, $newText)
[System.IO.File]::WriteAllText($file, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
