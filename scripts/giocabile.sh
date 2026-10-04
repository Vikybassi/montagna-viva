#!/bin/bash
# Il gioco sempre acceso su http://localhost:5200, senza il server di sviluppo.
#   ./scripts/giocabile.sh aggiorna      costruisce il gioco com'è adesso e lo copia nella cartella servita
#   ./scripts/giocabile.sh installa      aggiorna e crea il servizio del Mac (parte all'accesso, si riavvia da solo)
#   ./scripts/giocabile.sh togli         ferma e cancella il servizio (la cartella servita resta)
#   ./scripts/giocabile.sh stato         dice se è acceso
# Il servizio serve una COPIA del gioco: cambiare branch nel progetto non lo tocca; per vedere le novità: «aggiorna».
set -e
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HOME/Library/Application Support/MontagnaViva/www"
LABEL="it.vittoria.montagna-viva"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORTA=5200
UID_=$(id -u)

aggiorna() {
  (cd "$AQUI" && npm run build >/dev/null)
  mkdir -p "$DIR"
  rsync -a --delete "$AQUI/dist/" "$DIR/"
  echo "Gioco aggiornato ($(cd "$AQUI" && git rev-parse --abbrev-ref HEAD), $(cd "$AQUI" && git rev-parse --short HEAD))."
}
case "${1:-stato}" in
  aggiorna) aggiorna ;;
  installa)
    aggiorna
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>-m</string><string>http.server</string><string>$PORTA</string>
    <string>--bind</string><string>127.0.0.1</string><string>--directory</string><string>$DIR</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/montagna-viva.log</string>
  <key>StandardErrorPath</key><string>/tmp/montagna-viva.log</string>
</dict></plist>
PL
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_" "$PLIST"
    echo "Servizio acceso: http://localhost:$PORTA"
    ;;
  togli)
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Servizio tolto."
    ;;
  stato)
    if curl -s -o /dev/null "http://localhost:$PORTA"; then echo "Acceso: http://localhost:$PORTA"; else echo "Spento."; fi
    ;;
  *) echo "Uso: $0 aggiorna|installa|togli|stato"; exit 1 ;;
esac
