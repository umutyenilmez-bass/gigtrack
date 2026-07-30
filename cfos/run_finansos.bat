@echo off
title FinansOS - Baslatici
echo FinansOS Baslatiliyor...

:: Arka plan sunucusunu baslat (Yeni pencerede, minimize edilmis sekilde)
echo Arka plan sunucusu baslatiliyor (Port 5000)...
start "FinansOS Backend" /min cmd /c "pnpm exec tsx server/index.ts"

:: On yuz sunucusunu baslat (Yeni pencerede, minimize edilmis sekilde)
echo On yuz sunucusu baslatiliyor (Port 3000)...
start "FinansOS Frontend" /min cmd /c "pnpm run dev"

:: Sunucularin hazir olmasi icin 3 saniye bekle
echo Sunucularin yuklenmesi bekleniyor (3 saniye)...
timeout /t 3 /nobreak >nul

:: Tarayicida uygulamayi ac
echo Tarayici aciliyor: http://localhost:3000/
start http://localhost:3000/

echo.
echo =======================================================
echo  FinansOS basariyla baslatildi!
echo  Uygulamayi kapatmak icin acilan pencereleri kapatabilir
echo  veya bu pencerede bir tusa basarak kapatabilirsiniz.
echo =======================================================
echo.
pause
