; ─── Instalador de moon Studios: textos de bienvenida y final ─────────────
; Tauri incluye este archivo antes de armar las páginas, así que estas
; definiciones reemplazan los textos genéricos de NSIS.

!define MUI_WELCOMEPAGE_TITLE "Bienvenido a moon Studios"
!define MUI_WELCOMEPAGE_TEXT "Este asistente instalará el portal corporativo de moon Studios ${VERSION} en tu equipo.$\r$\n$\r$\nDesde la app tienes tu panel, calendario, correo interno, hilos, proyectos y las herramientas de tu área, siempre sincronizados con la web.$\r$\n$\r$\nCierra la app si la tienes abierta y pulsa Siguiente para continuar."
!define MUI_FINISHPAGE_TITLE "Todo listo"
!define MUI_FINISHPAGE_TEXT "moon Studios ${VERSION} quedó instalado.$\r$\n$\r$\nInicia sesión con tu cuenta corporativa. La app se actualizará sola cuando haya una versión nueva."
!define MUI_FINISHPAGE_RUN_TEXT "Abrir moon Studios"
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Se quitará moon Studios de este equipo. Tus datos en la nube (tareas, correos, proyectos) no se borran."
