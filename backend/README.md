# Backend Smart Office — instalação na Hostinger

Esta pasta não é publicada na Vercel (`.vercelignore`). Contém o que o Node-RED e o
MySQL precisam para o painel de dispositivos IoT e o registo RFID funcionarem de ponta a ponta.

```text
backend/
├── sql/001_device_management.sql            migração MySQL/MariaDB (idempotente)
├── node-red/
│   ├── smart-office-admin-api-v4.json        fluxo do painel (sessão DevTeam)
│   ├── smart-office-device-api-v2.json       fluxo dos ESP32
│   ├── src/*.js                              código das funções (fonte)
│   └── build-flows.js                        gera os .json a partir de src/
└── test/run-bench.sh                         bancada local: MariaDB 11.8 + Node-RED 4 + ESP32 simulado
```

## Ordem de instalação

1. **Cópia de segurança** da base de dados (phpMyAdmin → Exportar).
2. **Migração:** phpMyAdmin → base `u523573401_…` → Importar → `sql/001_device_management.sql`.
   Pode ser repetida sem efeitos secundários.
3. **`server.js` do Node-RED** (Hostinger):
   * em `httpNodeCors.methods` acrescentar `PATCH`: `"GET,PUT,POST,PATCH,DELETE,OPTIONS"`;
   * garantir `functionGlobalContext: { crypto: require("crypto") }`;
   * opcional: variáveis `SMART_OFFICE_ALLOWED_ORIGINS` (lista separada por vírgulas;
     predefinição `https://smart-office-self.vercel.app`) e `SMART_OFFICE_UTC_OFFSET_MINUTES`
     (predefinição `-60`, Cabo Verde);
   * reiniciar o Node-RED.
4. **Desativar** (duplo clique no separador → *Disabled*) os separadores antigos que
   definem as mesmas rotas: «Smart Office Admin API v3», «Smart Office Admin GET (Hostinger)»,
   «Smart Office Admin - Consultas» e o fluxo RFID anterior (`/api/device/register`,
   `/api/access/register/*`, `/api/access/card`, …). **Não** desativar o fluxo de login.
   Duas rotas iguais ativas = o Node-RED usa a primeira e o resultado é imprevisível.
5. **Importar** (menu → Importar) os dois `.json` de `node-red/`. Os fluxos usam o nó de
   configuração MySQL existente «Smart office» (`96426fc49ec39659`). Se o seu tiver outro ID,
   abra o nó «MySQL Smart Office (existente)» e escolha a base certa.
6. **Deploy** e verificação:
   ```bash
   curl https://support.smartcitycaboverde.com/api/health
   curl -i -X OPTIONS -H "Origin: https://smart-office-self.vercel.app" \
        -H "Access-Control-Request-Method: PATCH" https://support.smartcitycaboverde.com/api/access/devices/1
   # → Access-Control-Allow-Methods tem de incluir PATCH
   ```
   No painel: **Definições → Verificar endpoints**: todos os GET devem aparecer «Disponível».
7. **ESP32:** sem alterações ao firmware. Ao ligar, o dispositivo existente continua aprovado.
   Recomendado: **Dispositivos IoT → dispositivo → Gerar credencial**, copiar a chave para
   `DEVICE_API_KEY` e regravar o firmware. A partir daí o servidor exige `X-Device-Key`.

## Testes

```bash
bash backend/test/run-bench.sh      # requer Docker e Node.js 18+
```

O script cria MariaDB 11.8 e Node-RED 4 em Docker, carrega o esquema atual (reconstruído
a partir das consultas dos fluxos, com o procedimento antigo) e aplica a migração duas vezes.
Depois importa os fluxos e executa `api-test.js`: 67 verificações com o painel (sessão) e um
ESP32 simulado com os mesmos pedidos do firmware v2. Abrangem: login, CORS com PATCH,
adicionar/aprovar/rejeitar/desativar/revogar dispositivos, credenciais, heartbeat que não
reativa, registo completo, duplicado, cancelamento, erros específicos, acesso com janela
horária, eventos idempotentes, histórico e CSV.

Depois de instalar em produção, teste manualmente com um ESP32 real:
1. Dispositivos IoT: o ESP32 aparece «Online» até 90 s depois de ligado.
2. Acessos RFID: escolher o leitor → Iniciar registo → aproximar cartão → «Registo concluído» com o UID.
3. Cartões e Utilizadores mostram o novo registo; Histórico mostra a primeira passagem.
4. Desativar o dispositivo → o cartão passa a ser negado (`device_disabled`).

## Ao editar os fluxos

Altere `node-red/src/*.js` e corra `node backend/node-red/build-flows.js`. Não edite os
`.json` à mão: os IDs dos nós são determinísticos, por isso reimportar substitui os nós existentes.
