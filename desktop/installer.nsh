; Uninstalling Pager also removes its "launch at login" entry, so Windows is not left starting a program that is gone at every login.
; (Not when the uninstaller runs as part of an update: the new version is about to be installed and the entry must stay.)
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pager"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "pager-desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Pager"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.pager-desktop"
  ${endIf}
!macroend
