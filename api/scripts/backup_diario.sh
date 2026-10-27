#!/usr/bin/env bash
# Backup diário do Gestão Financeira CRM — banco inteiro + arquivos (uploads/).
#
# Roda como root pelo /etc/cron.d/gestao-financeira-backup às 03:00 (Brasília).
# A retenção de mídia do WhatsApp (jobs/midia-retencao-scheduler.ts, 04:30) só apaga
# arquivo se o backup de arquivos das últimas 26h terminou bem — é o `ULTIMO_OK`
# abaixo. Assim todo arquivo apagado pela cota ainda existe por 7 dias no backup.
#
#   banco:    pg_dump -Fc, 14 dias      → /var/backups/gestao_financeira/db/
#   arquivos: rsync com --link-dest, 7  → /var/backups/gestao_financeira/arquivos/AAAA-MM-DD/
#             (arquivo que não mudou vira hard link: cada dia só custa o que é novo)
#
# ATENÇÃO: é o MESMO disco do servidor. Protege de erro nosso (apagou o que não devia,
# migration errada), não de perda do disco ou da VPS. Para isso, copiar
# /var/backups/gestao_financeira para fora (snapshot da Hostinger ou storage externo).
#
# Restaurar o banco:  sudo -u postgres pg_restore -d gestao_financeira --clean <arquivo.dump>
# Restaurar arquivos: rsync -a /var/backups/gestao_financeira/arquivos/<dia>/ /var/www/apps/gestao_financeira/uploads/
set -euo pipefail

DESTINO=/var/backups/gestao_financeira
ORIGEM=/var/www/apps/gestao_financeira/uploads/
HOJE=$(TZ=America/Sao_Paulo date +%F)
DIAS_DB=14
DIAS_ARQUIVOS=7

mkdir -p "$DESTINO/db" "$DESTINO/arquivos"
chmod 700 "$DESTINO"

log() { echo "$(date -u +'%F %T') [backup] $*"; }

# ── Banco ─────────────────────────────────────────────────────────────────────
# Como postgres: parte das tabelas (historico_mensagens, planos, assinaturas) é dele,
# e o gestao_user não teria permissão de ler tudo.
DUMP="$DESTINO/db/gestao_financeira_$HOJE.dump"
sudo -u postgres pg_dump -Fc gestao_financeira > "$DUMP.tmp"
mv "$DUMP.tmp" "$DUMP"
log "banco: $(du -h "$DUMP" | cut -f1) em $DUMP"
find "$DESTINO/db" -name 'gestao_financeira_*.dump' -mtime +$DIAS_DB -delete

# ── Arquivos ──────────────────────────────────────────────────────────────────
ANTERIOR=$(ls -1d "$DESTINO"/arquivos/20??-??-?? 2>/dev/null | grep -v "/$HOJE\$" | tail -1 || true)
ALVO="$DESTINO/arquivos/$HOJE"
rsync -a --delete ${ANTERIOR:+--link-dest="$ANTERIOR"} "$ORIGEM" "$ALVO.tmp/"
rm -rf "$ALVO"
mv "$ALVO.tmp" "$ALVO"
log "arquivos: $(du -sh "$ALVO" | cut -f1) aparente em $ALVO (base: ${ANTERIOR:-nenhuma})"
ls -1d "$DESTINO"/arquivos/20??-??-?? | head -n -$DIAS_ARQUIVOS | xargs -r rm -rf

date -u +%FT%TZ > "$DESTINO/ULTIMO_OK"
log "ok — $(du -sh "$DESTINO" | cut -f1) ocupados no total"
