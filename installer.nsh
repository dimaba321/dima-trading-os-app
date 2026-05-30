; Dima Trading OS — NSIS customization
; Forces wizard pages to always show, even on upgrades/reinstalls

!macro preInit
  ; Always show the full wizard — never silent upgrade
  SetSilent normal
!macroend
