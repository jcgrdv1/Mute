@echo off
timeout /t 30 /nobreak
taskkill /F /IM chrome.exe >NUL 2>&1
timeout /t 3 /nobreak
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --use-fake-ui-for-media-stream ^
  --allow-file-access-from-files ^
  --autoplay-policy=no-user-gesture-required ^
  --disable-background-networking ^
  --disable-sync ^
  --disable-translate ^
  --no-first-run ^
  --disable-infobars ^
  --disable-extensions ^
  --user-data-dir="C:\Users\kiosk\mute-kiosk\chrome-profile" ^
  "file:///C:/Users/kiosk/mute-kiosk/index.html"
