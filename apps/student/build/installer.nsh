; The lab PC installer's own steps (STU-06; docs/docs/07-installation.md,
; Installing the student app), added to electron-builder's NSIS installer.
;
; - asks for the lab server's address, or takes it from /SERVER= on the
;   command line, and writes lingualab.config.json next to the app, where a
;   student's standard account cannot change it;
; - keeps the address the PC already has when the app is updated;
; - starts the app with Windows for every account (HKLM Run);
; - adds the lab's root certificate, from lab-root.crt beside the installer
;   or /CERT=, so the app trusts the server's HTTPS;
; - allows the app through the Windows firewall for LiveKit's media.
;
; Silent install on many PCs:
;   LinguaLab-Student-Setup-<version>.exe /S /SERVER=https://192.168.10.2

!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

!define LINGUALAB_RULE "LinguaLab Student"

!ifndef BUILD_UNINSTALLER
  !include StrContains.nsh

  Var ServerUrl
  Var ServerField
  Var CertFile

  !macro customInit
    ; An update removes the old version's files, the config among them,
    ; before it copies the new ones: put the config aside first.
    InitPluginsDir
    ${If} ${FileExists} "$INSTDIR\lingualab.config.json"
      CopyFiles /SILENT "$INSTDIR\lingualab.config.json" "$PLUGINSDIR\previous.config.json"
    ${EndIf}

    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/SERVER=" $ServerUrl
    ClearErrors
    ${GetOptions} $R0 "/CERT=" $CertFile
    ${If} $CertFile == ""
      StrCpy $CertFile "$EXEDIR\lab-root.crt"
    ${EndIf}

    ${If} $ServerUrl != ""
      Call CheckServerUrl
      Pop $0
      ${If} $0 != ""
        MessageBox MB_ICONSTOP "/SERVER=$ServerUrl: $0" /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${EndIf}
  !macroend

  ; "" when the address will do, or what is wrong with it. The app checks it
  ; again when it starts (src/main/config.ts).
  Function CheckServerUrl
    StrCpy $1 $ServerUrl 8
    StrCpy $2 $ServerUrl 7
    ${If} $1 != "https://"
    ${AndIf} $2 != "http://"
      Push "The address must start with https:// or http://"
      Return
    ${EndIf}
    ${StrContains} $3 '"' $ServerUrl
    ${StrContains} $4 "\" $ServerUrl
    ${StrContains} $5 " " $ServerUrl
    ${If} $3 != ""
    ${OrIf} $4 != ""
    ${OrIf} $5 != ""
      Push "The address cannot contain spaces, quotes or backslashes"
      Return
    ${EndIf}
    ; No trailing slash, as the app writes it.
    StrCpy $6 $ServerUrl "" -1
    ${If} $6 == "/"
      StrCpy $ServerUrl $ServerUrl -1
    ${EndIf}
    Push ""
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom ServerPageShow ServerPageLeave
  !macroend

  Function ServerPageShow
    ; An update keeps the address the PC has.
    ${If} ${FileExists} "$PLUGINSDIR\previous.config.json"
    ${AndIf} $ServerUrl == ""
      Abort
    ${EndIf}
    ${If} $ServerUrl == ""
      StrCpy $ServerUrl "https://"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 24u "The lab server's address on the lab network, as in the admin's installation notes:"
    Pop $0
    ${NSD_CreateText} 0 28u 100% 13u $ServerUrl
    Pop $ServerField
    ${NSD_CreateLabel} 0 48u 100% 12u "For example https://192.168.10.2"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function ServerPageLeave
    ${NSD_GetText} $ServerField $ServerUrl
    Call CheckServerUrl
    Pop $0
    ${If} $0 != ""
      MessageBox MB_ICONEXCLAMATION $0
      Abort
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  ${If} $ServerUrl != ""
    FileOpen $0 "$INSTDIR\lingualab.config.json" w
    FileWrite $0 '{ "serverUrl": "$ServerUrl" }$\r$\n'
    FileClose $0
  ${ElseIf} ${FileExists} "$PLUGINSDIR\previous.config.json"
    CopyFiles /SILENT "$PLUGINSDIR\previous.config.json" "$INSTDIR\lingualab.config.json"
  ${Else}
    DetailPrint "No server address given: the app will say so when it starts."
  ${EndIf}

  ; Starts with Windows for every account on this PC (STU-06).
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "LinguaLab Student" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'

  ${If} ${FileExists} $CertFile
    nsExec::ExecToLog '"$SYSDIR\certutil.exe" -f -addstore Root "$CertFile"'
    Pop $0
    DetailPrint "Root certificate added (certutil: $0)"
  ${Else}
    DetailPrint "No lab-root.crt beside the installer: the root certificate was not added."
  ${EndIf}

  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${LINGUALAB_RULE}"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="LinguaLab Student" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
  Pop $0
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller too: auto-start and the firewall rule
  ; stay for the new version. The root certificate stays either way, as the
  ; teacher console and the browser use it as well.
  ${IfNot} ${isUpdated}
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "LinguaLab Student"
    nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${LINGUALAB_RULE}"'
    Pop $0
  ${EndIf}
!macroend
