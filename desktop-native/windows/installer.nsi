; Installer for native Pager on Windows. It installs for the current user only (no administrator rights) and can update a running copy.
; Built by windows/package.sh. Pass /S for a silent install (the updater does).

!include "MUI2.nsh"
!include "FileFunc.nsh"
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
Name "Pager"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Pager Native"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; stop a running Pager so its files can be replaced (it is started again at the end)
  ExecWait 'taskkill /IM pager-native.exe /F'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Pager"
  CreateShortcut "$SMPROGRAMS\Pager\Pager.lnk" "$INSTDIR\pager-native.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative" "DisplayName" "Pager"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative" "NoModify" 1
  Exec '"$INSTDIR\pager-native.exe"'
SectionEnd

Section "Uninstall"
  ExecWait 'taskkill /IM pager-native.exe /F'
  Sleep 500
  Delete "$SMPROGRAMS\Pager\Pager.lnk"
  RMDir "$SMPROGRAMS\Pager"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PagerNative"
SectionEnd
