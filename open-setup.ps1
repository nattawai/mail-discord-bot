# เปิดหน้าตั้งค่าของบอทในเบราว์เซอร์
# อ่าน URL ของ Worker จาก .worker-url และ SETUP_KEY จาก .setup-key (ทั้งสองไฟล์ไม่ขึ้น git)
$url = (Get-Content -Raw (Join-Path $PSScriptRoot ".worker-url")).Trim()
$key = (Get-Content -Raw (Join-Path $PSScriptRoot ".setup-key")).Trim()
Start-Process "$url/setup?key=$key"
